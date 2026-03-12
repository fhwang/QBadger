import { describe, it, expect } from "vitest";
import { buildPrompt } from "../src/build-prompt.js";
import type { IssueSummary } from "../src/issue-summary.js";

describe("buildPrompt", () => {
  const baseIssue: IssueSummary = {
    issueNumber: 42,
    issueTitle: "Add login page",
    issueBody: "We need a login page with email and password fields.",
    branchName: "qbadger/42-add-login-page",
  };

  const config = {
    targetRepo: "lost-atlas/lost-atlas",
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
});
