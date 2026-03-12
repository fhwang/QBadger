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

  async run(config: ContainerConfig): Promise<ContainerResult> {
    this.log.info({ image: config.image }, "Creating container");
    const container = await this.docker.createContainer(this.buildContainerOptions(config));

    try {
      await container.start();
      if (config.timeoutMs) {
        return await this.raceWithTimeout(container, config.timeoutMs);
      }
      const result = await container.wait();
      return await this.collectResult(container, result.StatusCode, false);
    } finally {
      await container.remove({ force: true });
    }
  }
}
