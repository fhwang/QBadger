import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleIssuesAssigned } from "../src/handlers/issues-assigned.js";
import type { HandlerDeps } from "../src/server.js";

function makeSuccessResult() {
  return {
    type: "result" as const,
    subtype: "success" as const,
    session_id: "test-session",
    result: "Implementation complete",
    is_error: false,
    duration_ms: 1000,
    duration_api_ms: 800,
    num_turns: 3,
    cost_usd: 0.05,
    usage: { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use_input_tokens: 0 },
  };
}

function makeErrorResult() {
  return {
    type: "result" as const,
    subtype: "error_during_execution" as const,
    session_id: "test-session",
    is_error: true,
    errors: ["Something went wrong"],
    duration_ms: 1000,
    duration_api_ms: 800,
    num_turns: 3,
    cost_usd: 0.05,
    usage: { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use_input_tokens: 0 },
  };
}

function makeDeps(): HandlerDeps {
  return {
    github: {
      getIssue: vi.fn().mockResolvedValue({
        number: 42,
        title: "Add login page",
        body: "We need a login page",
      }),
      createBranch: vi.fn().mockResolvedValue({}),
      createPullRequest: vi.fn().mockResolvedValue({ number: 100 }),
      createComment: vi.fn().mockResolvedValue({}),
    } as unknown as HandlerDeps["github"],
    runSession: vi.fn().mockResolvedValue(makeSuccessResult()),
    config: {
      botUsername: "qbadger",
      targetRepo: "lost-atlas/lost-atlas",
      sessionTimeoutHours: 6,
      maxCiRetries: 5,
    },
  };
}

function makePayload(assignee = "qbadger") {
  return {
    action: "assigned",
    assignee: { login: assignee },
    issue: { number: 42, title: "Add login page", body: "We need a login page" },
  };
}

describe("handleIssuesAssigned", () => {
  let deps: HandlerDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("ignores assignments to other users", async () => {
    await handleIssuesAssigned(makePayload("someone-else"), deps);
    expect(deps.github.getIssue).not.toHaveBeenCalled();
  });

  it("fetches the issue details", async () => {
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.getIssue).toHaveBeenCalledWith(42);
  });

  it("creates a feature branch with slugified name", async () => {
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.createBranch).toHaveBeenCalledWith(
      expect.stringMatching(/^qbadger\/42-/),
    );
  });

  it("spawns a Claude Code session with timeout", async () => {
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.runSession).toHaveBeenCalledWith(
      expect.stringContaining("#42"),
      expect.any(Object),
      6 * 60 * 60 * 1000,
    );
  });

  it("opens a PR on success", async () => {
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.createPullRequest).toHaveBeenCalledWith({
      title: expect.stringContaining("Add login page"),
      body: expect.stringContaining("#42"),
      head: expect.stringMatching(/^qbadger\/42-/),
      base: "main",
    });
  });

  it("posts a comment on session error", async () => {
    (deps.runSession as ReturnType<typeof vi.fn>).mockResolvedValue(makeErrorResult());
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.createPullRequest).not.toHaveBeenCalled();
    expect(deps.github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("failed"),
    );
  });

  it("posts a comment when session throws", async () => {
    (deps.runSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("timeout"),
    );
  });
});
