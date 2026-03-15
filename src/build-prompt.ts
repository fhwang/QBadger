import type { HandlerConfig } from "./handler-config.js";
import type { IssueSummary } from "./issue-summary.js";

export interface ReviewComment {
  path: string;
  line: number | null;
  body: string;
}

export interface ReviewContext {
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  branchName: string;
  reviewBody: string | null;
  reviewerLogin: string;
  reviewComments: ReviewComment[];
}

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

export function buildReviewPrompt(
  review: ReviewContext,
  config: Pick<HandlerConfig, "targetRepo" | "maxCiRetries">,
): string {
  const reviewBodySection = review.reviewBody
    ? `\n\n## Review Summary\n\n${review.reviewBody}`
    : "";

  const commentsSection = review.reviewComments.length > 0
    ? `\n\n## Review Comments\n\n${review.reviewComments.map((c) => {
        const lineInfo = c.line ? ` (line ${c.line})` : "";
        return `- **${c.path}**${lineInfo}: ${c.body}`;
      }).join("\n")}`
    : "";

  return `You are addressing review feedback on PR #${review.prNumber}: ${review.prTitle}
${reviewBodySection}
${commentsSection}

## Instructions

You are working on the branch \`${review.branchName}\` in the repository \`${config.targetRepo}\`.

For each review comment, determine whether it is:
1. **A code change request** → Make the requested change, commit, and push.
2. **A question or clarification** → Reply to the specific review comment with an explanation using \`gh api\` to post a reply.

To reply to a specific review comment, use:
\`\`\`
gh api repos/${config.targetRepo}/pulls/${review.prNumber}/comments/{comment_id}/replies -f body="Your reply"
\`\`\`

After making all code changes (if any), push your commits to \`${review.branchName}\`.

## CI Monitoring

If you pushed code changes, monitor CI:

1. Wait for CI to complete using \`gh run watch --branch ${review.branchName}\`. If no runs are found yet, wait a moment and retry with \`gh run list --branch ${review.branchName} --limit 1\`.
2. If CI fails, read the logs with \`gh run view <run-id> --log-failed\`.
3. Diagnose the failure, fix the code, commit, and push again.
4. Wait for CI again using \`gh run watch\`.
5. Repeat up to ${config.maxCiRetries} times.

## Summary

When finished, post a summary comment on the PR tagging the reviewer @${review.reviewerLogin}, describing what changes were made and what questions were answered. Use \`gh pr comment ${review.prNumber}\` to post the summary.`;
}
