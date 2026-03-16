import pino from "pino";
import { Octokit } from "@octokit/rest";
import { createApp, type HandlerConfig } from "./server.js";
import { loadConfig, ConfigError } from "./config.js";
import { GitHubService } from "./github.js";
import { initLogger } from "./logger.js";
import { runSession } from "./session-runner.js";
import { createSessionManager } from "./session-manager.js";

export { runSession } from "./session-runner.js";
export { ContainerRunner } from "./container-runner.js";
export type { ContainerConfig, ContainerResult, VolumeMount } from "./container-runner.js";

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (e) {
  const fallbackLogger = pino({ name: "qbadger" });
  if (e instanceof ConfigError) {
    fallbackLogger.fatal(e.message);
  } else {
    fallbackLogger.fatal(e, "Unexpected error loading configuration");
  }
  process.exit(1);
}

const logger = initLogger({ targetRepo: config.targetRepo, logDir: config.logDir });

const octokit = new Octokit({ auth: config.githubToken });
const github = new GitHubService(octokit, config.targetRepo);
const sessionManager = createSessionManager(config.maxConcurrentSessions);

const handlerConfig: HandlerConfig = {
  botUsername: config.botUsername,
  targetRepo: config.targetRepo,
  sessionTimeoutHours: config.sessionTimeoutHours,
  maxCiRetries: config.maxCiRetries,
  transcriptDir: config.transcriptDir,
  transcriptRetentionDays: config.transcriptRetentionDays,
};

const app = createApp(config.githubWebhookSecret, {
  github,
  runSession,
  config: handlerConfig,
  sessionManager,
});

app.listen(config.port, () => {
  logger.info({ port: config.port }, "QBadger webhook server started");
});
