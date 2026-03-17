import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleIssuesAssigned } from "../src/handlers/issues-assigned.js";
import type { HandlerDeps } from "../src/server.js";
import { TranscriptWriter } from "../src/transcript-writer.js";
import { createSessionManager } from "../src/session-manager.js";

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
      findPullRequestForBranch: vi.fn().mockResolvedValue(null),
    } as unknown as HandlerDeps["github"],
    runSession: vi.fn().mockResolvedValue(makeSuccessResult()),
    config: {
      botUsername: "qbadger",
      targetRepo: "example-org/example-repo",
      sessionTimeoutHours: 6,
      maxCiRetries: 5,
      transcriptDir: "/tmp/test-transcripts",
      transcriptRetentionDays: 30,
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
      expect.any(Object),
    );
  });

  it("passes a TranscriptWriter to runSession", async () => {
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.runSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      6 * 60 * 60 * 1000,
      expect.any(TranscriptWriter),
    );
  });

  it("does not create a PR after successful session (Claude creates it)", async () => {
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.createPullRequest).not.toHaveBeenCalled();
  });

  it("does not post any comments on successful session", async () => {
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.createComment).not.toHaveBeenCalled();
  });

  it("posts a comment on the issue on session error", async () => {
    (deps.runSession as ReturnType<typeof vi.fn>).mockResolvedValue(makeErrorResult());
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("failed"),
    );
  });

  it("posts a timeout comment on the PR when session times out and PR exists", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    (deps.runSession as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);
    (deps.github.findPullRequestForBranch as ReturnType<typeof vi.fn>).mockResolvedValue({ number: 99 });

    await handleIssuesAssigned(makePayload(), deps);

    expect(deps.github.findPullRequestForBranch).toHaveBeenCalledWith(
      expect.stringMatching(/^qbadger\/42-/),
    );
    expect(deps.github.createComment).toHaveBeenCalledWith(
      99,
      expect.stringContaining("timed out"),
    );
  });

  it("posts a timeout comment on the issue when session times out and no PR exists", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    (deps.runSession as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);
    (deps.github.findPullRequestForBranch as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await handleIssuesAssigned(makePayload(), deps);

    expect(deps.github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("timed out"),
    );
  });

  it("posts a comment on the issue when session throws a non-timeout error", async () => {
    (deps.runSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("something broke"));
    await handleIssuesAssigned(makePayload(), deps);
    expect(deps.github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("something broke"),
    );
  });

  it("submits the session through the session manager", async () => {
    const sessionManager = createSessionManager(10);
    const submitSpy = vi.spyOn(sessionManager, "submit");
    deps.sessionManager = sessionManager;

    await handleIssuesAssigned(makePayload(), deps);

    expect(submitSpy).toHaveBeenCalledOnce();
    expect(deps.runSession).toHaveBeenCalledOnce();
  });

  it("posts a failure comment when session manager is killed", async () => {
    const sessionManager = createSessionManager(10);
    sessionManager.kill();
    deps.sessionManager = sessionManager;

    await handleIssuesAssigned(makePayload(), deps);

    expect(deps.github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("killed"),
    );
  });
});
