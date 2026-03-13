import { logger } from "../logger.js";
import { slugify } from "../slugify.js";
import { buildPrompt } from "../build-prompt.js";
import type { IssueSummary } from "../issue-summary.js";
import type { HandlerDeps } from "../server.js";

// eslint-disable-next-line no-magic-numbers
const MS_PER_HOUR = 60 * 60 * 1000;

function extractAssignee(body: Record<string, unknown>): string | undefined {
  return (body.assignee as Record<string, unknown>)?.login as string | undefined;
}

function extractIssueNumber(body: Record<string, unknown>): number {
  return (body.issue as Record<string, unknown>)?.number as number;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function failureComment(errorDetail: string): string {
  return `QBadger session failed while working on this issue.\n\n**Error:** ${errorDetail}`;
}

function timeoutComment(): string {
  return "QBadger session timed out while working on this issue. The session exceeded the configured timeout limit.";
}

interface PipelineContext {
  body: Record<string, unknown>;
  issueNumber: number;
  deps: HandlerDeps;
}

async function preparePipeline(issueNumber: number, deps: HandlerDeps) {
  const issue = await deps.github.getIssue(issueNumber);
  const branchName = `qbadger/${issueNumber}-${slugify(issue.title)}`;
  const issueSummary: IssueSummary = {
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueBody: issue.body ?? null,
    branchName,
  };
  await deps.github.createBranch(branchName);
  return { branchName, issueSummary };
}

async function runSessionForIssue(ctx: PipelineContext, issueSummary: IssueSummary): Promise<void> {
  const prompt = buildPrompt(issueSummary, ctx.deps.config);
  const timeoutMs = ctx.deps.config.sessionTimeoutHours * MS_PER_HOUR;
  const result = await ctx.deps.runSession(prompt, {}, timeoutMs);

  if (result.is_error) {
    const errorDetail = "errors" in result ? result.errors.join("\n") : "Unknown error";
    await ctx.deps.github.createComment(ctx.issueNumber, failureComment(errorDetail));
  }
}

async function handleTimeoutError(
  branchName: string,
  issueNumber: number,
  deps: HandlerDeps,
): Promise<void> {
  logger.error({ issueNumber, branchName }, "Session timed out");
  try {
    const pr = await deps.github.findPullRequestForBranch(branchName);
    const commentTarget = pr ? pr.number : issueNumber;
    await deps.github.createComment(commentTarget, timeoutComment());
  } catch (commentError) {
    logger.error({ error: formatError(commentError), issueNumber }, "Failed to post timeout comment");
  }
}

async function handlePipelineError(
  error: unknown,
  issueNumber: number,
  deps: HandlerDeps,
): Promise<void> {
  logger.error({ error: formatError(error), issueNumber }, "Pipeline failed");
  try {
    await deps.github.createComment(issueNumber, failureComment(formatError(error)));
  } catch (commentError) {
    logger.error({ error: formatError(commentError), issueNumber }, "Failed to post failure comment");
  }
}

async function runPipeline(body: Record<string, unknown>, issueNumber: number, deps: HandlerDeps): Promise<void> {
  let branchName: string | undefined;
  try {
    const prepared = await preparePipeline(issueNumber, deps);
    branchName = prepared.branchName;
    await runSessionForIssue({ body, issueNumber, deps }, prepared.issueSummary);
  } catch (error) {
    if (isTimeoutError(error) && branchName) {
      await handleTimeoutError(branchName, issueNumber, deps);
    } else {
      await handlePipelineError(error, issueNumber, deps);
    }
  }
}

export async function handleIssuesAssigned(
  body: Record<string, unknown>,
  deps: HandlerDeps,
): Promise<void> {
  const assignee = extractAssignee(body);
  const issueNumber = extractIssueNumber(body);
  const log = logger.child({ issueNumber, assignee });

  if (assignee !== deps.config.botUsername) {
    log.info("Ignoring assignment to non-bot user");
    return;
  }

  log.info("Bot assigned to issue, starting pipeline");
  await runPipeline(body, issueNumber, deps);
}
