import { describe, it, expect, vi, beforeEach } from "vitest";
import { handlePullRequestReviewSubmitted } from "../src/handlers/pull-request-review-submitted.js";
import type { HandlerDeps } from "../src/server.js";

function makeSuccessResult() {
  return {
    type: "result" as const,
    subtype: "success" as const,
    session_id: "test-session",
    result: "Review feedback addressed",
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
      getPullRequest: vi.fn().mockResolvedValue({
        number: 100,
        title: "Add login page",
        body: "Resolves #42",
        head: { ref: "qbadger/42-add-login-page" },
      }),
      getReview: vi.fn().mockResolvedValue({
        id: 555,
        body: "A few changes needed",
        user: { login: "alice" },
        state: "CHANGES_REQUESTED",
      }),
      listReviewComments: vi.fn().mockResolvedValue([
        { id: 1, path: "src/login.ts", line: 10, body: "Use bcrypt" },
      ]),
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

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    action: "submitted",
    pull_request: {
      number: 100,
      head: { ref: "qbadger/42-add-login-page" },
    },
    review: {
      id: 555,
      user: { login: "alice" },
      state: "changes_requested",
      body: "A few changes needed",
    },
    ...overrides,
  };
}

describe("handlePullRequestReviewSubmitted", () => {
  let deps: HandlerDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it("ignores reviews on non-QBadger PRs", async () => {
    const payload = makePayload({
      pull_request: { number: 100, head: { ref: "feature/my-branch" } },
    });
    await handlePullRequestReviewSubmitted(payload, deps);
    expect(deps.runSession).not.toHaveBeenCalled();
  });

  it("ignores reviews submitted by the bot itself", async () => {
    const payload = makePayload({
      review: { id: 555, user: { login: "qbadger" }, state: "commented", body: "Done" },
    });
    await handlePullRequestReviewSubmitted(payload, deps);
    expect(deps.runSession).not.toHaveBeenCalled();
  });

  it("fetches PR details, review, and review comments", async () => {
    await handlePullRequestReviewSubmitted(makePayload(), deps);
    expect(deps.github.getPullRequest).toHaveBeenCalledWith(100);
    expect(deps.github.getReview).toHaveBeenCalledWith(100, 555);
    expect(deps.github.listReviewComments).toHaveBeenCalledWith(100);
  });

  it("spawns a Claude Code session with timeout", async () => {
    await handlePullRequestReviewSubmitted(makePayload(), deps);
    expect(deps.runSession).toHaveBeenCalledWith(
      expect.stringContaining("#100"),
      expect.any(Object),
      6 * 60 * 60 * 1000,
    );
  });

  it("includes review comments in the session prompt", async () => {
    await handlePullRequestReviewSubmitted(makePayload(), deps);
    const prompt = (deps.runSession as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("Use bcrypt");
    expect(prompt).toContain("src/login.ts");
  });

  it("posts a failure comment on the PR when session returns an error", async () => {
    (deps.runSession as ReturnType<typeof vi.fn>).mockResolvedValue(makeErrorResult());
    await handlePullRequestReviewSubmitted(makePayload(), deps);
    expect(deps.github.createComment).toHaveBeenCalledWith(
      100,
      expect.stringContaining("failed"),
    );
  });

  it("posts a timeout comment on the PR when session times out", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    (deps.runSession as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);
    await handlePullRequestReviewSubmitted(makePayload(), deps);
    expect(deps.github.createComment).toHaveBeenCalledWith(
      100,
      expect.stringContaining("timed out"),
    );
  });

  it("posts a failure comment on the PR when session throws a non-timeout error", async () => {
    (deps.runSession as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("something broke"));
    await handlePullRequestReviewSubmitted(makePayload(), deps);
    expect(deps.github.createComment).toHaveBeenCalledWith(
      100,
      expect.stringContaining("something broke"),
    );
  });

  it("does not post any comment on success", async () => {
    await handlePullRequestReviewSubmitted(makePayload(), deps);
    expect(deps.github.createComment).not.toHaveBeenCalled();
  });
});
