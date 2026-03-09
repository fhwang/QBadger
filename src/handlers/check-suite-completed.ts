import { logger } from "../logger.js";

export function handleCheckSuiteCompleted(body: Record<string, unknown>): void {
  logger.info({ body }, "Received check_suite.completed event");
}
