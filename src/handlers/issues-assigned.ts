import { logger } from "../logger.js";
import { slugify } from "../slugify.js";
import { buildPrompt } from "../build-prompt.js";
import { isTimeoutError, notifyFailure, notifyTimeout } from "../failure-notifications.js";
import type { IssueSummary } from "../issue-summary.js";
import type { HandlerDeps } from "../server.js";
import { TranscriptWriter } from "../transcript-writer.js";
import { cleanupTranscripts } from "../transcript-cleanup.js";
import { MS_PER_HOUR } from "../time-constants.js";

function extractAssignee(body: Record<string, unknown>): string | undefined {
  return (body.assignee as Record<string, unknown>)?.login as string | undefined;
}

function extractIssueNumber(body: Record<string, unknown>): number {
  return (body.issue as Record<string, unknown>)?.number as number;
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

async function runSessionForIssue(issueNumber: number, issueSummary: IssueSummary, deps: HandlerDeps): Promise<void> {
  const prompt = buildPrompt(issueSummary, deps.config);
  const timeoutMs = deps.config.sessionTimeoutHours * MS_PER_HOUR;
  const writer = new TranscriptWriter(deps.config.transcriptDir, `issue-${issueNumber}`);
  await writer.open();
  const result = await deps.runSession(prompt, {}, timeoutMs, writer);

  if (result.is_error) {
    const errorDetail = "errors" in result ? result.errors.join("\n") : "Unknown error";
    await notifyFailure(deps.github, issueNumber, new Error(errorDetail));
  }
}

async function runPipeline(issueNumber: number, deps: HandlerDeps): Promise<void> {
  let branchName: string | undefined;
  try {
    const prepared = await preparePipeline(issueNumber, deps);
    branchName = prepared.branchName;
    await runSessionForIssue(issueNumber, prepared.issueSummary, deps);
    await cleanupTranscripts(deps.config.transcriptDir, deps.config.transcriptRetentionDays);
  } catch (error) {
    if (isTimeoutError(error) && branchName) {
      await notifyTimeout(deps.github, branchName, issueNumber);
    } else {
      await notifyFailure(deps.github, issueNumber, error);
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
  await runPipeline(issueNumber, deps);
}
