import type { HandlerDeps } from "../server.js";
import { logger } from "../logger.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handlePullRequestReviewSubmitted(body: Record<string, unknown>, _deps: HandlerDeps): void {
  logger.info({ body }, "Received pull_request_review.submitted event");
}
