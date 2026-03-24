import type Dockerode from "dockerode";
import { logger } from "./logger.js";

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readOnly?: boolean;
}

export interface ContainerConfig {
  image: string;
  command?: string[];
  env?: Record<string, string>;
  volumes?: VolumeMount[];
  user?: string;
  timeoutMs?: number;
}

export interface ContainerResult {
  containerId: string;
  exitCode: number;
  logs: string;
  timedOut: boolean;
}

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const PERCENT = 100;

function roundTwo(n: number): number {
  return Math.round(n * PERCENT) / PERCENT;
}

function createTimeout(ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  return {
    promise,
    clear() { clearTimeout(timer); },
  };
}

export class ContainerRunner {
  private docker: Dockerode;
  private log = logger.child({ module: "ContainerRunner" });

  constructor(docker: Dockerode) {
    this.docker = docker;
  }

  private buildBinds(volumes: VolumeMount[]): string[] {
    return volumes.map((v) => {
      const mode = v.readOnly ? "ro" : "rw";
      return `${v.hostPath}:${v.containerPath}:${mode}`;
    });
  }

  private buildContainerOptions(config: ContainerConfig): Dockerode.ContainerCreateOptions {
    const hostConfig: Dockerode.HostConfig | undefined = config.volumes?.length
      ? { Binds: this.buildBinds(config.volumes) }
      : undefined;

    return {
      Image: config.image,
      Cmd: config.command,
      Env: config.env
        ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      User: config.user,
      HostConfig: hostConfig,
    };
  }

  private async raceWithTimeout(
    container: Dockerode.Container,
    timeoutMs: number,
  ): Promise<ContainerResult> {
    const timeout = createTimeout(timeoutMs);
    const raceResult = await Promise.race([
      container.wait().then((r) => ({ kind: "done" as const, statusCode: r.StatusCode })),
      timeout.promise.then(() => ({ kind: "timeout" as const })),
    ]);

    if (raceResult.kind === "timeout") {
      this.log.warn({ containerId: container.id }, "Container timed out, stopping");
      await container.stop();
      const finalResult = await container.wait();
      return this.collectResult(container, finalResult.StatusCode, true);
    }

    timeout.clear();
    return this.collectResult(container, raceResult.statusCode, false);
  }

  private async logContainerStats(
    container: Dockerode.Container,
    phase: "start" | "end",
  ): Promise<void> {
    try {
      const stats = await container.stats({ stream: false });
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = systemDelta > 0
        ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * PERCENT
        : 0;
      const memoryUsageMb = stats.memory_stats.usage / BYTES_PER_MB;
      const memoryLimitMb = stats.memory_stats.limit / BYTES_PER_MB;
      const memoryPercent = (stats.memory_stats.usage / stats.memory_stats.limit) * PERCENT;

      this.log.info({
        containerId: container.id,
        phase,
        cpuPercent: roundTwo(cpuPercent),
        memoryUsageMb: roundTwo(memoryUsageMb),
        memoryLimitMb: roundTwo(memoryLimitMb),
        memoryPercent: roundTwo(memoryPercent),
      }, "Container resource usage");
    } catch (err) {
      this.log.warn({ containerId: container.id, phase, err }, "Failed to collect container stats");
    }
  }

  private async collectResult(
    container: Dockerode.Container,
    exitCode: number,
    timedOut: boolean,
  ): Promise<ContainerResult> {
    const logs = await container.logs({ stdout: true, stderr: true });
    return {
      containerId: container.id,
      exitCode,
      logs: String(logs),
      timedOut,
    };
  }

  private async waitForResult(
    container: Dockerode.Container,
    config: ContainerConfig,
  ): Promise<ContainerResult> {
    if (config.timeoutMs) {
      return this.raceWithTimeout(container, config.timeoutMs);
    }
    const waitResult = await container.wait();
    return this.collectResult(container, waitResult.StatusCode, false);
  }

  async run(config: ContainerConfig): Promise<ContainerResult> {
    this.log.info({ image: config.image }, "Creating container");
    const container = await this.docker.createContainer(this.buildContainerOptions(config));

    try {
      await container.start();
      await this.logContainerStats(container, "start");
      const result = await this.waitForResult(container, config);
      await this.logContainerStats(container, "end");
      return result;
    } finally {
      await container.remove({ force: true });
    }
  }
}
