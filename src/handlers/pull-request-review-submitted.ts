import { logger } from "../logger.js";
import { buildReviewPrompt } from "../build-prompt.js";
import type { ReviewComment, ReviewContext } from "../review-context.js";
import type { HandlerDeps } from "../server.js";
import { TranscriptWriter } from "../transcript-writer.js";
import { cleanupTranscripts } from "../transcript-cleanup.js";
import { MS_PER_HOUR } from "../time-constants.js";
const QBADGER_BRANCH_PREFIX = "qbadger/";

interface ReviewPayload {
  prNumber: number;
  branchName: string;
  reviewId: number;
  reviewerLogin: string;
}

function extractPayload(body: Record<string, unknown>): ReviewPayload {
  const pr = body.pull_request as Record<string, unknown>;
  const review = body.review as Record<string, unknown>;
  return {
    prNumber: pr.number as number,
    branchName: (pr.head as Record<string, unknown>).ref as string,
    reviewId: review.id as number,
    reviewerLogin: (review.user as Record<string, unknown>).login as string,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function failureComment(errorDetail: string): string {
  return `QBadger session failed while addressing review feedback.\n\n**Error:** ${errorDetail}`;
}

function timeoutComment(): string {
  return "QBadger session timed out while addressing review feedback. The session exceeded the configured timeout limit.";
}

function toReviewComments(comments: Record<string, unknown>[]): ReviewComment[] {
  return comments.map((c) => ({
    path: c.path as string,
    line: (c.line as number) ?? null,
    body: c.body as string,
  }));
}

async function fetchReviewContext(payload: ReviewPayload, deps: HandlerDeps): Promise<ReviewContext> {
  const { prNumber, branchName, reviewId, reviewerLogin } = payload;
  const [pr, review, comments] = await Promise.all([
    deps.github.getPullRequest(prNumber),
    deps.github.getReview(prNumber, reviewId),
    deps.github.listReviewComments(prNumber),
  ]);

  return {
    prNumber,
    prTitle: pr.title as string,
    prBody: (pr.body as string) ?? null,
    branchName,
    reviewBody: (review.body as string) ?? null,
    reviewerLogin,
    reviewComments: toReviewComments(comments as unknown as Record<string, unknown>[]),
  };
}

async function runReviewSession(context: ReviewContext, deps: HandlerDeps): Promise<void> {
  const prompt = buildReviewPrompt(context, deps.config);
  const timeoutMs = deps.config.sessionTimeoutHours * MS_PER_HOUR;
  const writer = new TranscriptWriter(deps.config.transcriptDir, `review-pr-${context.prNumber}`);
  await writer.open();

  const doRun = () => deps.runSession(prompt, {}, timeoutMs, writer);
  const result = deps.sessionManager
    ? await deps.sessionManager.submit(doRun)
    : await doRun();

  if (result.is_error) {
    const errorDetail = "errors" in result ? result.errors.join("\n") : "Unknown error";
    await deps.github.createComment(context.prNumber, failureComment(errorDetail));
  }

  await cleanupTranscripts(deps.config.transcriptDir, deps.config.transcriptRetentionDays);
}

async function handleSessionError(error: unknown, payload: ReviewPayload, deps: HandlerDeps): Promise<void> {
  const log = logger.child(payload);
  if (isTimeoutError(error)) {
    log.error("Session timed out");
    try {
      await deps.github.createComment(payload.prNumber, timeoutComment());
    } catch (commentError) {
      log.error({ error: formatError(commentError) }, "Failed to post timeout comment");
    }
  } else {
    log.error({ error: formatError(error) }, "Review followup failed");
    try {
      await deps.github.createComment(payload.prNumber, failureComment(formatError(error)));
    } catch (commentError) {
      log.error({ error: formatError(commentError) }, "Failed to post failure comment");
    }
  }
}

function shouldIgnore(payload: ReviewPayload, deps: HandlerDeps): boolean {
  const log = logger.child(payload);
  if (!payload.branchName.startsWith(QBADGER_BRANCH_PREFIX)) {
    log.info("Ignoring review on non-QBadger PR");
    return true;
  }
  if (payload.reviewerLogin === deps.config.botUsername) {
    log.info("Ignoring review submitted by bot");
    return true;
  }
  return false;
}

export async function handlePullRequestReviewSubmitted(
  body: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<void> {
  const payload = extractPayload(body);
  if (shouldIgnore(payload, deps)) {
    return;
  }

  logger.child(payload).info("Review submitted on QBadger PR, starting followup");

  try {
    const context = await fetchReviewContext(payload, deps);
    await runReviewSession(context, deps);
  } catch (error) {
    await handleSessionError(error, payload, deps);
  }
}
