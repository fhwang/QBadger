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

  async run(config: ContainerConfig): Promise<ContainerResult> {
    this.log.info({ image: config.image }, "Creating container");

    const container = await this.docker.createContainer({
      Image: config.image,
      Cmd: config.command,
    });

    try {
      await container.start();
      const waitResult = await container.wait();
      const logs = await container.logs({ stdout: true, stderr: true });

      return {
        containerId: container.id,
        exitCode: waitResult.StatusCode,
        logs: logs as unknown as string,
        timedOut: false,
      };
    } finally {
      await container.remove({ force: true });
    }
  }
}
