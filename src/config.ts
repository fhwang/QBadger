export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface Config {
  githubToken: string;
  githubWebhookSecret: string;
  anthropicApiKey: string;
  botUsername: string;
  targetRepo: string;
  maxConcurrentSessions: number;
  sessionTimeoutHours: number;
  maxCiRetries: number;
  port: number;
}

const REQUIRED_VARS = [
  "GITHUB_TOKEN",
  "GITHUB_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
] as const;

export function loadConfig(): Config {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  const githubToken = process.env.GITHUB_TOKEN as string;
  const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET as string;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY as string;

  return {
    githubToken,
    githubWebhookSecret,
    anthropicApiKey,
    botUsername: process.env.BOT_USERNAME ?? "qbadger",
    targetRepo: process.env.TARGET_REPO ?? "lost-atlas/lost-atlas",
    maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS ?? "10", 10),
    sessionTimeoutHours: parseInt(process.env.SESSION_TIMEOUT_HOURS ?? "6", 10),
    maxCiRetries: parseInt(process.env.MAX_CI_RETRIES ?? "5", 10),
    port: parseInt(process.env.PORT ?? "3000", 10),
  };
}
