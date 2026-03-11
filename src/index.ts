import { createApp } from "./server.js";
import { loadConfig, ConfigError } from "./config.js";
import { logger } from "./logger.js";

export { runSession } from "./session-runner.js";

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

const app = createApp(config.githubWebhookSecret);

app.listen(config.port, () => {
  logger.info({ port: config.port }, "QBadger webhook server started");
});
