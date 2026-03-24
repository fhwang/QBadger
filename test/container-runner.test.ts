import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerRunner } from "../src/container-runner.js";

const pendingResolvers: ((value: unknown) => void)[] = [];
function neverResolve<T>(): Promise<T> {
  return new Promise<T>((r) => { pendingResolvers.push(r as (value: unknown) => void); });
}

function createMockStats() {
  return {
    cpu_stats: {
      cpu_usage: { total_usage: 500_000_000 },
      system_cpu_usage: 10_000_000_000,
      online_cpus: 2,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 400_000_000 },
      system_cpu_usage: 9_000_000_000,
    },
    memory_stats: {
      usage: 134_217_728, // 128 MiB
      limit: 1_073_741_824, // 1 GiB
    },
  };
}

function createMockContainer(overrides?: {
  waitResult?: { StatusCode: number };
  logs?: string;
  stats?: ReturnType<typeof createMockStats>;
}) {
  const waitResult = overrides?.waitResult ?? { StatusCode: 0 };
  const logs = overrides?.logs ?? "session output\n";
  const stats = overrides?.stats ?? createMockStats();

  return {
    id: "abc123",
    start: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue(waitResult),
    logs: vi.fn().mockResolvedValue(logs),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    stats: vi.fn().mockResolvedValue(stats),
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
    mockContainer.wait.mockReturnValue(neverResolve<{ StatusCode: number }>());
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

  describe("container resource tracking", () => {
    it("calls stats twice during a successful run (start and end)", async () => {
      await runner.run({ image: "qbadger-worker:latest" });

      expect(mockContainer.stats).toHaveBeenCalledTimes(2);
      expect(mockContainer.stats).toHaveBeenCalledWith({ stream: false });
    });

    it("calls stats twice during a timed-out run", async () => {
      mockContainer.wait.mockReturnValue(neverResolve<{ StatusCode: number }>());
      mockContainer.stop.mockImplementation(() => {
        mockContainer.wait.mockResolvedValue({ StatusCode: 137 });
        return Promise.resolve();
      });

      await runner.run({ image: "qbadger-worker:latest", timeoutMs: 50 });

      expect(mockContainer.stats).toHaveBeenCalledTimes(2);
    });

    it("still completes run if stats call fails", async () => {
      mockContainer.stats.mockRejectedValue(new Error("stats unavailable"));

      const result = await runner.run({ image: "qbadger-worker:latest" });

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });
  });
});
