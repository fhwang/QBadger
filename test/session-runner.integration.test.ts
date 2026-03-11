import { describe, it, expect } from "vitest";
import { runSession } from "../src/session-runner.js";

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN_INTEGRATION)("session runner integration", () => {
  it("spawns a real Claude Code session with a trivial prompt", async () => {
    const result = await runSession({
      prompt: "Reply with exactly: hello world",
      maxTurns: 1,
      timeoutMs: 60_000,
    });

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.sessionId).toBeDefined();
  }, 120_000);
});
