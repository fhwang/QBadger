import type { HandlerConfig } from "./handler-config.js";
import type { IssueSummary } from "./issue-summary.js";

export function buildPrompt(
  issue: IssueSummary,
  config: Pick<HandlerConfig, "targetRepo" | "maxCiRetries">,
): string {
  const bodySection = issue.issueBody
    ? `\n\n## Issue Description\n\n${issue.issueBody}`
    : "";

  return `You are implementing GitHub issue #${issue.issueNumber}: ${issue.issueTitle}
${bodySection}

## Instructions

You are working on the branch \`${issue.branchName}\` in the repository \`${config.targetRepo}\`.

1. Read the issue carefully and understand what needs to be done.
2. Implement the changes needed to resolve the issue.
3. Write tests for your changes.
4. Commit your changes with a clear commit message referencing issue #${issue.issueNumber}.
5. Push your commits to the branch \`${issue.branchName}\`.

## Pull Request

After pushing, create a pull request:

\`\`\`
gh pr create --repo ${config.targetRepo} --head ${issue.branchName} --base main --title "${issue.issueTitle}" --body "Resolves #${issue.issueNumber}"
\`\`\`

## CI Monitoring

After creating the PR, monitor CI:

1. Wait for CI to complete using \`gh run watch --branch ${issue.branchName}\`. If no runs are found yet, wait a moment and retry with \`gh run list --branch ${issue.branchName} --limit 1\`.
2. If CI fails, read the logs with \`gh run view <run-id> --log-failed\`.
3. Diagnose the failure, fix the code, commit, and push again.
4. Wait for CI again using \`gh run watch\`.
5. Repeat up to ${config.maxCiRetries} times.
6. When finished (CI passes or max retries reached), post a summary comment on the PR describing what was done and the final CI status. Use \`gh pr comment\` to post the summary comment.`;
}
