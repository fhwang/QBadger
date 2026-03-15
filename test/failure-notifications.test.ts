import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatError, isTimeoutError, notifyFailure, notifyTimeout } from "../src/failure-notifications.js";
import type { GitHubService } from "../src/github.js";

function makeGithub(): GitHubService {
  return {
    createComment: vi.fn().mockResolvedValue({}),
    findPullRequestForBranch: vi.fn().mockResolvedValue(null),
  } as unknown as GitHubService;
}

describe("formatError", () => {
  it("extracts message from Error instances", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });

  it("converts non-Error values to string", () => {
    expect(formatError("string error")).toBe("string error");
    expect(formatError(42)).toBe("42");
  });
});

describe("isTimeoutError", () => {
  it("returns true for AbortError DOMException", () => {
    const err = new DOMException("The operation was aborted", "AbortError");
    expect(isTimeoutError(err)).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isTimeoutError(new Error("nope"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isTimeoutError("string")).toBe(false);
  });
});

describe("notifyFailure", () => {
  let github: GitHubService;

  beforeEach(() => {
    github = makeGithub();
  });

  it("posts a failure comment on the issue", async () => {
    await notifyFailure(github, 42, new Error("something broke"));

    expect(github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("failed"),
    );
    expect(github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("something broke"),
    );
  });

  it("catches and does not rethrow comment posting errors", async () => {
    (github.createComment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("GitHub down"));

    await expect(notifyFailure(github, 42, new Error("original"))).resolves.toBeUndefined();
  });
});

describe("notifyTimeout", () => {
  let github: GitHubService;

  beforeEach(() => {
    github = makeGithub();
  });

  it("posts timeout comment on the PR when one exists", async () => {
    (github.findPullRequestForBranch as ReturnType<typeof vi.fn>).mockResolvedValue({ number: 99 });

    await notifyTimeout(github, "qbadger/42-feature", 42);

    expect(github.findPullRequestForBranch).toHaveBeenCalledWith("qbadger/42-feature");
    expect(github.createComment).toHaveBeenCalledWith(
      99,
      expect.stringContaining("timed out"),
    );
  });

  it("posts timeout comment on the issue when no PR exists", async () => {
    await notifyTimeout(github, "qbadger/42-feature", 42);

    expect(github.createComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining("timed out"),
    );
  });

  it("catches and does not rethrow comment posting errors", async () => {
    (github.findPullRequestForBranch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("GitHub down"));

    await expect(notifyTimeout(github, "qbadger/42-feature", 42)).resolves.toBeUndefined();
  });
});
