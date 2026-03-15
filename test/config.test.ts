import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, ConfigError } from "../src/config.js";

function withEnv(vars: Record<string, string>, fn: () => void): void {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const REQUIRED_ENV = {
  GITHUB_TOKEN: "ghp_test123",
  GITHUB_WEBHOOK_SECRET: "webhook-secret-123",
  ANTHROPIC_API_KEY: "sk-ant-test123",
};

describe("loadConfig", () => {
  beforeEach(() => {
    const keysToClean = [
      "GITHUB_TOKEN",
      "GITHUB_WEBHOOK_SECRET",
      "ANTHROPIC_API_KEY",
      "BOT_USERNAME",
      "TARGET_REPO",
      "MAX_CONCURRENT_SESSIONS",
      "SESSION_TIMEOUT_HOURS",
      "MAX_CI_RETRIES",
      "PORT",
    ];
    for (const key of keysToClean) {
      delete process.env[key];
    }
  });

  describe("required variables", () => {
    it("throws ConfigError when GITHUB_TOKEN is missing", () => {
      withEnv({
        GITHUB_WEBHOOK_SECRET: "secret",
        ANTHROPIC_API_KEY: "key",
      }, () => {
        expect(() => loadConfig()).toThrow(ConfigError);
        expect(() => loadConfig()).toThrow("GITHUB_TOKEN");
      });
    });

    it("throws ConfigError when GITHUB_WEBHOOK_SECRET is missing", () => {
      withEnv({
        GITHUB_TOKEN: "token",
        ANTHROPIC_API_KEY: "key",
      }, () => {
        expect(() => loadConfig()).toThrow(ConfigError);
        expect(() => loadConfig()).toThrow("GITHUB_WEBHOOK_SECRET");
      });
    });

    it("throws ConfigError when ANTHROPIC_API_KEY is missing", () => {
      withEnv({
        GITHUB_TOKEN: "token",
        GITHUB_WEBHOOK_SECRET: "secret",
      }, () => {
        expect(() => loadConfig()).toThrow(ConfigError);
        expect(() => loadConfig()).toThrow("ANTHROPIC_API_KEY");
      });
    });

    it("throws ConfigError listing all missing vars when multiple are missing", () => {
      expect(() => loadConfig()).toThrow(ConfigError);
      try {
        loadConfig();
      } catch (e) {
        const error = e as ConfigError;
        expect(error.message).toContain("GITHUB_TOKEN");
        expect(error.message).toContain("GITHUB_WEBHOOK_SECRET");
        expect(error.message).toContain("ANTHROPIC_API_KEY");
      }
    });

    it("returns config when all required vars are present", () => {
      withEnv(REQUIRED_ENV, () => {
        const config = loadConfig();
        expect(config.githubToken).toBe("ghp_test123");
        expect(config.githubWebhookSecret).toBe("webhook-secret-123");
        expect(config.anthropicApiKey).toBe("sk-ant-test123");
      });
    });
  });

  describe("defaults", () => {
    it("applies default bot username", () => {
      withEnv(REQUIRED_ENV, () => {
        const config = loadConfig();
        expect(config.botUsername).toBe("qbadger");
      });
    });

    it("applies default target repo", () => {
      withEnv(REQUIRED_ENV, () => {
        const config = loadConfig();
        expect(config.targetRepo).toBe("lost-atlas/lost-atlas");
      });
    });

    it("applies default max concurrent sessions", () => {
      withEnv(REQUIRED_ENV, () => {
        const config = loadConfig();
        expect(config.maxConcurrentSessions).toBe(10);
      });
    });

    it("applies default session timeout hours", () => {
      withEnv(REQUIRED_ENV, () => {
        const config = loadConfig();
        expect(config.sessionTimeoutHours).toBe(6);
      });
    });

    it("applies default max CI retries", () => {
      withEnv(REQUIRED_ENV, () => {
        const config = loadConfig();
        expect(config.maxCiRetries).toBe(5);
      });
    });

    it("applies default port", () => {
      withEnv(REQUIRED_ENV, () => {
        const config = loadConfig();
        expect(config.port).toBe(3000);
      });
    });
  });

  describe("overrides", () => {
    it("overrides bot username", () => {
      withEnv({ ...REQUIRED_ENV, BOT_USERNAME: "mybot" }, () => {
        const config = loadConfig();
        expect(config.botUsername).toBe("mybot");
      });
    });

    it("overrides target repo", () => {
      withEnv({ ...REQUIRED_ENV, TARGET_REPO: "org/other-repo" }, () => {
        const config = loadConfig();
        expect(config.targetRepo).toBe("org/other-repo");
      });
    });

    it("overrides max concurrent sessions", () => {
      withEnv({ ...REQUIRED_ENV, MAX_CONCURRENT_SESSIONS: "5" }, () => {
        const config = loadConfig();
        expect(config.maxConcurrentSessions).toBe(5);
      });
    });

    it("overrides session timeout hours", () => {
      withEnv({ ...REQUIRED_ENV, SESSION_TIMEOUT_HOURS: "2" }, () => {
        const config = loadConfig();
        expect(config.sessionTimeoutHours).toBe(2);
      });
    });

    it("overrides max CI retries", () => {
      withEnv({ ...REQUIRED_ENV, MAX_CI_RETRIES: "3" }, () => {
        const config = loadConfig();
        expect(config.maxCiRetries).toBe(3);
      });
    });

    it("overrides port", () => {
      withEnv({ ...REQUIRED_ENV, PORT: "8080" }, () => {
        const config = loadConfig();
        expect(config.port).toBe(8080);
      });
    });
  });
});
