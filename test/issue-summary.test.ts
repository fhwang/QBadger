import { describe, it, expect } from "vitest";
import { parseIssueFromWebhook } from "../src/issue-summary.js";

describe("parseIssueFromWebhook", () => {
  it("extracts issue fields from a webhook payload", () => {
    const body = {
      action: "assigned",
      issue: {
        number: 42,
        title: "Add login page",
        body: "We need a login page.",
      },
    };

    const result = parseIssueFromWebhook(body, "qbadger/42-add-login-page");

    expect(result).toEqual({
      issueNumber: 42,
      issueTitle: "Add login page",
      issueBody: "We need a login page.",
      branchName: "qbadger/42-add-login-page",
    });
  });

  it("handles null issue body", () => {
    const body = {
      action: "assigned",
      issue: {
        number: 7,
        title: "Fix bug",
        body: null,
      },
    };

    const result = parseIssueFromWebhook(body, "qbadger/7-fix-bug");

    expect(result.issueBody).toBeNull();
  });
});
