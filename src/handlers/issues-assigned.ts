import { logger } from "../logger.js";

export function handleIssuesAssigned(body: Record<string, unknown>): void {
  logger.info({ body }, "Received issues.assigned event");
}
