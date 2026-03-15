import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createLogger } from "../src/logger.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbadger-logger-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function flush(logger: ReturnType<typeof createLogger>): Promise<void> {
  return new Promise((resolve) => {
    logger.flush();
    setTimeout(resolve, 500);
  });
}

async function readLogLines(dir: string): Promise<string[]> {
  const files = await fs.readdir(dir);
  const logFiles = files.filter((f) => f.endsWith(".log") || /^\d+$/.test(f));
  if (logFiles.length === 0) {
    return [];
  }
  const content = await fs.readFile(path.join(dir, logFiles[0]!), "utf-8");
  return content.trim().split("\n");
}

describe("createLogger", () => {
  it("includes repo in base context", async () => {
    const logger = createLogger({ targetRepo: "org/repo", logDir: tmpDir });
    logger.info("test message");
    await flush(logger);
    const lines = await readLogLines(tmpDir);
    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines[0]!);
    expect(entry.repo).toBe("org/repo");
  });

  it("redacts path-based secret fields", async () => {
    const logger = createLogger({ targetRepo: "org/repo", logDir: tmpDir });
    logger.info({ githubToken: "ghp_abc123secret" }, "with token");
    await flush(logger);
    const lines = await readLogLines(tmpDir);
    const entry = JSON.parse(lines[0]!);
    expect(entry.githubToken).toBe("[Redacted]");
  });

  it("child loggers inherit base context", async () => {
    const logger = createLogger({ targetRepo: "org/repo", logDir: tmpDir });
    const child = logger.child({ issueNumber: 42 });
    child.info("child message");
    await flush(logger);
    const lines = await readLogLines(tmpDir);
    const entry = JSON.parse(lines[0]!);
    expect(entry.repo).toBe("org/repo");
    expect(entry.issueNumber).toBe(42);
  });
});
