import type { HandlerDeps } from "../server.js";
import { logger } from "../logger.js";

export function handleCheckSuiteCompleted(body: Record<string, unknown>, _deps: HandlerDeps): void {
  logger.info({ body }, "Received check_suite.completed event");
}
