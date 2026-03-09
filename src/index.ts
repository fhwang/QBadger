import { createApp } from "./server.js";
import { logger } from "./logger.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  logger.fatal("GITHUB_WEBHOOK_SECRET environment variable is required");
  process.exit(1);
}

const app = createApp(WEBHOOK_SECRET);

app.listen(PORT, () => {
  logger.info({ port: PORT }, "QBadger webhook server started");
});
