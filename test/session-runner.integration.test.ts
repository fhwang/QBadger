import { describe, it, expect } from "vitest";
import { runSession } from "../src/session-runner.js";

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN_INTEGRATION)("session runner integration", () => {
  it("spawns a real Claude Code session with a trivial prompt", async () => {
    const result = await runSession(
      "Reply with exactly: hello world",
      { maxTurns: 1 },
      60_000,
    );

    expect(result.subtype).toBe("success");
    expect(result.duration_ms).toBeGreaterThan(0);
    expect(result.session_id).toBeDefined();
  }, 120_000);
});
