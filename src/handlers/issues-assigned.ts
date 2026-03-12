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

function failureComment(errorDetail: string): string {
  return `QBadger session failed while working on this issue.\n\n**Error:** ${errorDetail}`;
}

interface PipelineContext {
  body: Record<string, unknown>;
  issueNumber: number;
  deps: HandlerDeps;
}

async function runSessionAndOpenPr(ctx: PipelineContext, branchName: string, issueSummary: IssueSummary): Promise<void> {
  const prompt = buildPrompt(issueSummary, ctx.deps.config);
  const timeoutMs = ctx.deps.config.sessionTimeoutHours * MS_PER_HOUR;
  const result = await ctx.deps.runSession(prompt, {}, timeoutMs);

  if (result.is_error) {
    const errorDetail = "errors" in result ? result.errors.join("\n") : "Unknown error";
    await ctx.deps.github.createComment(ctx.issueNumber, failureComment(errorDetail));
    return;
  }

  await ctx.deps.github.createPullRequest({
    title: issueSummary.issueTitle,
    body: `Resolves #${ctx.issueNumber}\n\nImplemented by QBadger.`,
    head: branchName,
    base: "main",
  });
}

async function runPipeline(ctx: PipelineContext): Promise<void> {
  const issue = await ctx.deps.github.getIssue(ctx.issueNumber);
  const branchName = `qbadger/${ctx.issueNumber}-${slugify(issue.title)}`;
  const issueSummary: IssueSummary = {
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueBody: issue.body ?? null,
    branchName,
  };
  await ctx.deps.github.createBranch(branchName);
  await runSessionAndOpenPr(ctx, branchName, issueSummary);
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

  try {
    await runPipeline({ body, issueNumber, deps });
  } catch (error) {
    await handlePipelineError(error, issueNumber, deps);
  }
}
