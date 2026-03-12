import type { HandlerDeps } from "../server.js";
import { logger } from "../logger.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleIssueCommentCreated(body: Record<string, unknown>, _deps: HandlerDeps): void {
  logger.info({ body }, "Received issue_comment.created event");
}
