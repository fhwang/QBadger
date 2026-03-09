import { logger } from "../logger.js";

export function handleIssueCommentCreated(body: Record<string, unknown>): void {
  logger.info({ body }, "Received issue_comment.created event");
}
