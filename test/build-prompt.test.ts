import { describe, it, expect } from "vitest";
import { buildPrompt, buildReviewPrompt } from "../src/build-prompt.js";
import type { IssueSummary } from "../src/issue-summary.js";

describe("buildPrompt", () => {
  const baseIssue: IssueSummary = {
    issueNumber: 42,
    issueTitle: "Add login page",
    issueBody: "We need a login page with email and password fields.",
    branchName: "qbadger/42-add-login-page",
  };

  const config = {
    targetRepo: "example-org/example-repo",
    maxCiRetries: 5,
  };

  it("includes the issue number and title", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toContain("#42");
    expect(prompt).toContain("Add login page");
  });

  it("includes the issue body", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toContain("email and password fields");
  });

  it("includes the branch name", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toContain("qbadger/42-add-login-page");
  });

  it("includes CI retry instructions with the configured max", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toContain("5");
    expect(prompt).toMatch(/ci/i);
  });

  it("includes push instructions", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toMatch(/push/i);
  });

  it("handles null issue body", () => {
    const prompt = buildPrompt({ ...baseIssue, issueBody: null }, config);
    expect(prompt).toContain("#42");
    expect(prompt).not.toContain("null");
  });

  it("includes gh run watch for waiting on CI", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toContain("gh run watch");
  });

  it("instructs Claude to create the PR via gh pr create", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toContain("gh pr create");
  });

  it("instructs Claude to post a summary comment on the PR", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toMatch(/summary comment/i);
  });

  it("includes the target repo in PR creation instructions", () => {
    const prompt = buildPrompt(baseIssue, config);
    expect(prompt).toContain("example-org/example-repo");
  });
});

describe("buildReviewPrompt", () => {
  const reviewContext = {
    prNumber: 100,
    prTitle: "Add login page",
    prBody: "Resolves #42",
    branchName: "qbadger/42-add-login-page",
    reviewBody: "A few things need to change.",
    reviewerLogin: "alice",
    reviewComments: [
      { path: "src/login.ts", line: 10, body: "Use bcrypt instead of md5" },
      { path: "src/login.ts", line: 25, body: "Why is this hardcoded?" },
    ],
  };

  const config = {
    targetRepo: "example-org/example-repo",
    maxCiRetries: 5,
  };

  it("includes the PR number and title", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toContain("#100");
    expect(prompt).toContain("Add login page");
  });

  it("includes the branch name", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toContain("qbadger/42-add-login-page");
  });

  it("includes the review body", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toContain("A few things need to change.");
  });

  it("includes the reviewer login", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toContain("alice");
  });

  it("includes inline review comments with file and line info", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toContain("src/login.ts");
    expect(prompt).toContain("line 10");
    expect(prompt).toContain("Use bcrypt instead of md5");
    expect(prompt).toContain("line 25");
    expect(prompt).toContain("Why is this hardcoded?");
  });

  it("instructs Claude to categorize comments as code changes or questions", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toMatch(/code change/i);
    expect(prompt).toMatch(/question|clarification/i);
  });

  it("instructs Claude to reply to review comments via gh", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toContain("gh");
  });

  it("includes CI monitoring instructions", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toContain("gh run watch");
    expect(prompt).toContain("5");
  });

  it("instructs Claude to post a summary comment tagging the reviewer", () => {
    const prompt = buildReviewPrompt(reviewContext, config);
    expect(prompt).toContain("@alice");
  });

  it("handles null review body", () => {
    const prompt = buildReviewPrompt({ ...reviewContext, reviewBody: null }, config);
    expect(prompt).not.toContain("null");
  });

  it("handles empty review comments", () => {
    const prompt = buildReviewPrompt({ ...reviewContext, reviewComments: [] }, config);
    expect(prompt).toContain("#100");
  });
});
