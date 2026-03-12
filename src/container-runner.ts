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

export class ContainerRunner {
  private docker: Dockerode;
  private log = logger.child({ module: "ContainerRunner" });

  constructor(docker: Dockerode) {
    this.docker = docker;
  }

  private buildHostConfig(config: ContainerConfig): Dockerode.HostConfig | undefined {
    if (!config.volumes?.length) {
      return undefined;
    }

    return {
      Binds: config.volumes.map((v) => {
        const mode = v.readOnly ? "ro" : "rw";
        return `${v.hostPath}:${v.containerPath}:${mode}`;
      }),
    };
  }

  async run(config: ContainerConfig): Promise<ContainerResult> {
    this.log.info({ image: config.image }, "Creating container");

    const container = await this.docker.createContainer({
      Image: config.image,
      Cmd: config.command,
      Env: config.env
        ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      User: config.user,
      HostConfig: this.buildHostConfig(config),
    });

    try {
      await container.start();

      let timedOut = false;
      let waitResult: { StatusCode: number };

      if (config.timeoutMs) {
        const timeoutPromise = new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), config.timeoutMs),
        );
        const raceResult = await Promise.race([
          container.wait().then((r: { StatusCode: number }) => ({ kind: "done" as const, result: r })),
          timeoutPromise.then(() => ({ kind: "timeout" as const })),
        ]);

        if (raceResult.kind === "timeout") {
          timedOut = true;
          this.log.warn({ containerId: container.id }, "Container timed out, stopping");
          await container.stop();
          waitResult = await container.wait();
        } else {
          waitResult = raceResult.result;
        }
      } else {
        waitResult = await container.wait();
      }

      const logs = await container.logs({ stdout: true, stderr: true });

      return {
        containerId: container.id,
        exitCode: waitResult.StatusCode,
        logs: logs as unknown as string,
        timedOut,
      };
    } finally {
      await container.remove({ force: true });
    }
  }
}
