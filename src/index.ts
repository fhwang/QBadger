import { Octokit } from "@octokit/rest";
import { createApp, type HandlerConfig } from "./server.js";
import { loadConfig, ConfigError } from "./config.js";
import { GitHubService } from "./github.js";
import { logger } from "./logger.js";
import { runSession } from "./session-runner.js";

export { runSession } from "./session-runner.js";
export { ContainerRunner } from "./container-runner.js";
export type { ContainerConfig, ContainerResult, VolumeMount } from "./container-runner.js";

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (e) {
  if (e instanceof ConfigError) {
    logger.fatal(e.message);
  } else {
    logger.fatal(e, "Unexpected error loading configuration");
  }
  process.exit(1);
}

const octokit = new Octokit({ auth: config.githubToken });
const github = new GitHubService(octokit, config.targetRepo);

const handlerConfig: HandlerConfig = {
  botUsername: config.botUsername,
  targetRepo: config.targetRepo,
  sessionTimeoutHours: config.sessionTimeoutHours,
  maxCiRetries: config.maxCiRetries,
};

const app = createApp(config.githubWebhookSecret, {
  github,
  runSession,
  config: handlerConfig,
});

app.listen(config.port, () => {
  logger.info({ port: config.port }, "QBadger webhook server started");
});
