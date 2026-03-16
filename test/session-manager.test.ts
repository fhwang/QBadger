import { describe, it, expect } from "vitest";
import { createSessionManager } from "../src/session-manager.js";

describe("createSessionManager", () => {
  it("runs a submitted task and returns its result", async () => {
    const manager = createSessionManager(2);
    const result = await manager.submit(() => Promise.resolve("done"));
    expect(result).toBe("done");
  });

  it("propagates task errors to the caller", async () => {
    const manager = createSessionManager(2);
    await expect(
      manager.submit(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });

  it("queues tasks when max concurrency is reached", async () => {
    const manager = createSessionManager(1);
    const order: string[] = [];

    let resolveFirst!: () => void;
    const firstBlocks = new Promise<void>((r) => { resolveFirst = r; });

    const first = manager.submit(async () => {
      order.push("first-start");
      await firstBlocks;
      order.push("first-end");
      return "a";
    });

    const second = manager.submit(() => {
      order.push("second-start");
      return Promise.resolve("b");
    });

    // second should not have started yet
    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    resolveFirst();
    const [r1, r2] = await Promise.all([first, second]);

    expect(r1).toBe("a");
    expect(r2).toBe("b");
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("reports status with active, queued, and killed counts", async () => {
    const manager = createSessionManager(1);

    expect(manager.status()).toEqual({ active: 0, queued: 0, killed: false });

    let resolveFirst!: () => void;
    const firstBlocks = new Promise<void>((r) => { resolveFirst = r; });

    const first = manager.submit(() => firstBlocks);
    // Let the microtask for acquire settle
    await Promise.resolve();
    expect(manager.status()).toEqual({ active: 1, queued: 0, killed: false });

    const second = manager.submit(() => Promise.resolve());
    await Promise.resolve();
    expect(manager.status()).toEqual({ active: 1, queued: 1, killed: false });

    resolveFirst();
    await Promise.all([first, second]);
    expect(manager.status()).toEqual({ active: 0, queued: 0, killed: false });
  });

  it("kill rejects new submissions", async () => {
    const manager = createSessionManager(2);
    manager.kill();

    await expect(
      manager.submit(() => Promise.resolve("nope")),
    ).rejects.toThrow();
    expect(manager.status().killed).toBe(true);
  });

  it("kill rejects queued tasks", async () => {
    const manager = createSessionManager(1);

    let resolveFirst!: () => void;
    const firstBlocks = new Promise<void>((r) => { resolveFirst = r; });

    const first = manager.submit(() => firstBlocks);
    const second = manager.submit(() => Promise.resolve("queued"));

    await Promise.resolve();
    manager.kill();

    await expect(second).rejects.toThrow();

    // Active task still completes normally
    resolveFirst();
    await expect(first).resolves.toBeUndefined();
  });
});
