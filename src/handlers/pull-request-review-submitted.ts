import { logger } from "../logger.js";

export function handlePullRequestReviewSubmitted(body: Record<string, unknown>): void {
  logger.info({ body }, "Received pull_request_review.submitted event");
}
