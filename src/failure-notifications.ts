import type { GitHubService } from "./github.js";
import { logger } from "./logger.js";

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function failureComment(errorDetail: string): string {
  return `QBadger session failed while working on this issue.\n\n**Error:** ${errorDetail}`;
}

function timeoutComment(): string {
  return "QBadger session timed out while working on this issue. The session exceeded the configured timeout limit.";
}

export async function notifyFailure(
  github: GitHubService,
  issueNumber: number,
  error: unknown,
): Promise<void> {
  try {
    await github.createComment(issueNumber, failureComment(formatError(error)));
  } catch (commentError) {
    logger.error({ error: formatError(commentError), issueNumber }, "Failed to post failure comment");
  }
}

export async function notifyTimeout(
  github: GitHubService,
  branchName: string,
  issueNumber: number,
): Promise<void> {
  try {
    const pr = await github.findPullRequestForBranch(branchName);
    const commentTarget = pr ? pr.number : issueNumber;
    await github.createComment(commentTarget, timeoutComment());
  } catch (commentError) {
    logger.error({ error: formatError(commentError), issueNumber }, "Failed to post timeout comment");
  }
}
