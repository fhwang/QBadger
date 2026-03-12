import type { HandlerDeps } from "../server.js";
import { logger } from "../logger.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function handleCheckSuiteCompleted(body: Record<string, unknown>, _deps: HandlerDeps): void {
  logger.info({ body }, "Received check_suite.completed event");
}
