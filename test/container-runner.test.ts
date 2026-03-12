import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerRunner } from "../src/container-runner.js";

function createMockContainer(overrides?: {
  waitResult?: { StatusCode: number };
  logs?: string;
}) {
  const waitResult = overrides?.waitResult ?? { StatusCode: 0 };
  const logs = overrides?.logs ?? "session output\n";

  return {
    id: "abc123",
    start: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue(waitResult),
    logs: vi.fn().mockResolvedValue(logs),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDocker(container = createMockContainer()) {
  return {
    createContainer: vi.fn().mockResolvedValue(container),
  };
}

describe("ContainerRunner", () => {
  let mockContainer: ReturnType<typeof createMockContainer>;
  let mockDocker: ReturnType<typeof createMockDocker>;
  let runner: ContainerRunner;

  beforeEach(() => {
    mockContainer = createMockContainer();
    mockDocker = createMockDocker(mockContainer);
    runner = new ContainerRunner(mockDocker as never);
  });

  it("runs a container and returns result on success", async () => {
    const result = await runner.run({
      image: "qbadger-worker:latest",
      command: ["node", "run-session.js"],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Image: "qbadger-worker:latest",
        Cmd: ["node", "run-session.js"],
      }),
    );
    expect(mockContainer.start).toHaveBeenCalled();
    expect(mockContainer.wait).toHaveBeenCalled();
    expect(mockContainer.logs).toHaveBeenCalled();
    expect(mockContainer.remove).toHaveBeenCalled();
    expect(result).toEqual({
      containerId: "abc123",
      exitCode: 0,
      logs: "session output\n",
      timedOut: false,
    });
  });

  it("passes environment variables to the container", async () => {
    const result = await runner.run({
      image: "qbadger-worker:latest",
      env: {
        ANTHROPIC_API_KEY: "sk-test",
        GITHUB_TOKEN: "ghp-test",
        TASK_PROMPT: "Fix the bug",
      },
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Env: [
          "ANTHROPIC_API_KEY=sk-test",
          "GITHUB_TOKEN=ghp-test",
          "TASK_PROMPT=Fix the bug",
        ],
      }),
    );
    expect(result.exitCode).toBe(0);
  });

  it("mounts volumes into the container", async () => {
    await runner.run({
      image: "qbadger-worker:latest",
      volumes: [
        { hostPath: "/home/user/.ssh", containerPath: "/root/.ssh", readOnly: true },
        { hostPath: "/home/user/.gitconfig", containerPath: "/root/.gitconfig", readOnly: true },
      ],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Binds: [
            "/home/user/.ssh:/root/.ssh:ro",
            "/home/user/.gitconfig:/root/.gitconfig:ro",
          ],
        }),
      }),
    );
  });

  it("runs container as specified user", async () => {
    await runner.run({
      image: "qbadger-worker:latest",
      user: "1000:1000",
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        User: "1000:1000",
      }),
    );
  });

  it("mounts read-write volumes when readOnly is false", async () => {
    await runner.run({
      image: "qbadger-worker:latest",
      volumes: [
        { hostPath: "/tmp/workspace", containerPath: "/workspace" },
      ],
    });

    expect(mockDocker.createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          Binds: ["/tmp/workspace:/workspace:rw"],
        }),
      }),
    );
  });
});
