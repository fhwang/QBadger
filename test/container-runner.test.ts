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

  it("stops container and returns timedOut when timeout expires", async () => {
    const neverResolve = new Promise<{ StatusCode: number }>(() => {});
    mockContainer.wait.mockReturnValue(neverResolve);
    mockContainer.stop.mockImplementation(() => {
      mockContainer.wait.mockResolvedValue({ StatusCode: 137 });
      return Promise.resolve();
    });

    const result = await runner.run({
      image: "qbadger-worker:latest",
      timeoutMs: 50,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(137);
    expect(mockContainer.stop).toHaveBeenCalled();
    expect(mockContainer.remove).toHaveBeenCalled();
  });

  it("returns non-zero exit code on container failure", async () => {
    mockContainer = createMockContainer({
      waitResult: { StatusCode: 1 },
      logs: "Error: something failed\n",
    });
    mockDocker = createMockDocker(mockContainer);
    runner = new ContainerRunner(mockDocker as never);

    const result = await runner.run({
      image: "qbadger-worker:latest",
    });

    expect(result.exitCode).toBe(1);
    expect(result.logs).toBe("Error: something failed\n");
    expect(result.timedOut).toBe(false);
  });

  it("removes container even if start fails", async () => {
    mockContainer.start.mockRejectedValue(new Error("start failed"));

    await expect(
      runner.run({ image: "qbadger-worker:latest" }),
    ).rejects.toThrow("start failed");

    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
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
