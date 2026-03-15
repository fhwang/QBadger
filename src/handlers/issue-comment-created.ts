import type { HandlerDeps } from "../server.js";
import { logger } from "../logger.js";

export function handleIssueCommentCreated(body: Record<string, unknown>, _deps: HandlerDeps): void {
  logger.info({ body }, "Received issue_comment.created event");
}
