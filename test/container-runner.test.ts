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
});
