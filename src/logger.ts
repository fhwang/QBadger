import pino from "pino";

export interface LoggerConfig {
  targetRepo: string;
  logDir: string;
}

const REDACT_PATHS = [
  "githubToken",
  "githubWebhookSecret",
  "anthropicApiKey",
  "token",
  "apiKey",
  "secret",
  "authorization",
];

const FIFTY_MB = "50m";
const MAX_LOG_FILES = 10;

export function createLogger(config: LoggerConfig): pino.Logger {
  return pino({
    name: "qbadger",
    redact: {
      paths: REDACT_PATHS,
      censor: "[Redacted]",
    },
    transport: {
      target: "pino-roll",
      options: {
        file: `${config.logDir}/qbadger`,
        size: FIFTY_MB,
        limit: { count: MAX_LOG_FILES },
        extension: ".log",
        mkdir: true,
      },
    },
  }).child({ repo: config.targetRepo });
}

// Backwards-compatible default logger for modules that import { logger }
// before createLogger is called (e.g., container-runner.ts, failure-notifications.ts).
// Replaced at startup via initLogger().
let _logger: pino.Logger = pino({ name: "qbadger" });

export function initLogger(config: LoggerConfig): pino.Logger {
  _logger = createLogger(config);
  return _logger;
}

export { _logger as logger };
