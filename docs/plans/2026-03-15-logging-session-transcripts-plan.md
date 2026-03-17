# Logging & Session Transcripts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured logging with redaction, session transcript capture to disk, and log rotation.

**Architecture:** Enhance existing Pino logger with `createLogger()` factory, add pino-roll transport for file rotation, capture SDK message streams to JSONL files, and add age-based transcript cleanup after each session.

**Tech Stack:** Pino, pino-roll, Node.js fs/promises, Vitest

---

### Task 1: Install pino-roll dependency

**Files:**
- Modify: `package.json`

**Step 1: Install pino-roll**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm add pino-roll`

**Step 2: Verify installation**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm build`
Expected: PASS (no build errors)

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "Add pino-roll dependency for log rotation"
```

---

### Task 2: Add config fields for logging and transcripts

**Files:**
- Modify: `src/config.ts`
- Test: `test/config.test.ts`

**Step 1: Write failing tests for new config fields**

Add to `test/config.test.ts` in the "defaults" describe block:

```typescript
it("applies default log dir", () => {
  withEnv(REQUIRED_ENV, () => {
    const config = loadConfig();
    expect(config.logDir).toBe("./logs");
  });
});

it("applies default transcript dir", () => {
  withEnv(REQUIRED_ENV, () => {
    const config = loadConfig();
    expect(config.transcriptDir).toBe("./transcripts");
  });
});

it("applies default transcript retention days", () => {
  withEnv(REQUIRED_ENV, () => {
    const config = loadConfig();
    expect(config.transcriptRetentionDays).toBe(30);
  });
});
```

Add to `test/config.test.ts` in the "overrides" describe block:

```typescript
it("overrides log dir", () => {
  withEnv({ ...REQUIRED_ENV, LOG_DIR: "/var/log/qbadger" }, () => {
    const config = loadConfig();
    expect(config.logDir).toBe("/var/log/qbadger");
  });
});

it("overrides transcript dir", () => {
  withEnv({ ...REQUIRED_ENV, TRANSCRIPT_DIR: "/data/transcripts" }, () => {
    const config = loadConfig();
    expect(config.transcriptDir).toBe("/data/transcripts");
  });
});

it("overrides transcript retention days", () => {
  withEnv({ ...REQUIRED_ENV, TRANSCRIPT_RETENTION_DAYS: "7" }, () => {
    const config = loadConfig();
    expect(config.transcriptRetentionDays).toBe(7);
  });
});
```

Also add `"LOG_DIR"`, `"TRANSCRIPT_DIR"`, `"TRANSCRIPT_RETENTION_DAYS"` to the `keysToClean` array in the `beforeEach`.

**Step 2: Run tests to verify they fail**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/config.test.ts`
Expected: FAIL — `config.logDir`, `config.transcriptDir`, `config.transcriptRetentionDays` don't exist.

**Step 3: Implement config changes**

In `src/config.ts`, add to the `AppConfig` interface:

```typescript
interface AppConfig extends HandlerConfig {
  githubToken: string;
  githubWebhookSecret: string;
  anthropicApiKey: string;
  maxConcurrentSessions: number;
  port: number;
  logDir: string;
  transcriptDir: string;
  transcriptRetentionDays: number;
}
```

In `loadConfig()`, add to the return object:

```typescript
logDir: process.env.LOG_DIR ?? "./logs",
transcriptDir: process.env.TRANSCRIPT_DIR ?? "./transcripts",
transcriptRetentionDays: parseInt(process.env.TRANSCRIPT_RETENTION_DAYS ?? "30", 10),
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "Add config fields for log dir, transcript dir, and retention days"
```

---

### Task 3: Create logger with redaction and file transport

**Files:**
- Modify: `src/logger.ts`
- Create: `test/logger.test.ts`

**Step 1: Write failing tests for the new logger**

Create `test/logger.test.ts`:

```typescript
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
    setTimeout(resolve, 100);
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/logger.test.ts`
Expected: FAIL — `createLogger` does not exist.

**Step 3: Implement createLogger**

Replace `src/logger.ts` with:

```typescript
import pino from "pino";

interface LoggerConfig {
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

const FIFTY_MB = 50 * 1024 * 1024;
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
        frequency: "custom",
        size: `${FIFTY_MB}`,
        limit: { count: MAX_LOG_FILES },
        extension: ".log",
        mkdir: true,
      },
    },
  }, pino.destination({ sync: false })).child({ repo: config.targetRepo });
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
```

NOTE: The backwards-compatible `logger` export ensures existing code (`container-runner.ts`, `failure-notifications.ts`, handlers) continues to work. `initLogger()` is called at startup in `index.ts` to replace the default with the configured logger.

**Step 4: Run tests to verify they pass**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/logger.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test`
Expected: PASS — existing tests still work since `logger` export is unchanged.

**Step 6: Commit**

```bash
git add src/logger.ts test/logger.test.ts
git commit -m "Add createLogger with pino-roll transport and path-based redaction"
```

---

### Task 4: Wire initLogger into startup

**Files:**
- Modify: `src/index.ts`

**Step 1: Update index.ts to call initLogger**

In `src/index.ts`, replace the import of `logger` with `initLogger`:

```typescript
import { initLogger } from "./logger.js";
```

After `config = loadConfig()` succeeds and before the Octokit creation, add:

```typescript
const logger = initLogger({ targetRepo: config.targetRepo, logDir: config.logDir });
```

Update the `catch` block for ConfigError to use a fallback logger (since `initLogger` hasn't been called yet):

```typescript
import pino from "pino";

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
```

**Step 2: Build and verify**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm build`
Expected: PASS

**Step 3: Run full test suite**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "Wire initLogger into application startup"
```

---

### Task 5: Transcript writer module

**Files:**
- Create: `src/transcript-writer.ts`
- Create: `test/transcript-writer.test.ts`

**Step 1: Write failing tests for transcript writer**

Create `test/transcript-writer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { TranscriptWriter, buildTranscriptFilename, type TranscriptContext } from "../src/transcript-writer.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbadger-transcript-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("buildTranscriptFilename", () => {
  it("builds a filename with timestamp and identifier", () => {
    const context: TranscriptContext = { type: "issue", identifier: "issue-42" };
    const filename = buildTranscriptFilename(context, new Date("2026-03-15T10:30:00Z"));
    expect(filename).toBe("2026-03-15T10-30-00Z-issue-42.jsonl");
  });

  it("builds a filename for review context", () => {
    const context: TranscriptContext = { type: "review", identifier: "review-pr-17" };
    const filename = buildTranscriptFilename(context, new Date("2026-01-02T03:04:05Z"));
    expect(filename).toBe("2026-01-02T03-04-05Z-review-pr-17.jsonl");
  });
});

describe("TranscriptWriter", () => {
  it("writes messages as JSONL lines", async () => {
    const context: TranscriptContext = { type: "issue", identifier: "issue-42" };
    const writer = new TranscriptWriter(tmpDir, context);
    await writer.open();

    await writer.write({ type: "system", subtype: "init", session_id: "sess-1" });
    await writer.write({ type: "assistant", message: { content: "Hello" } });
    await writer.close();

    const filePath = writer.filePath;
    expect(filePath).toBeDefined();
    const content = await fs.readFile(filePath!, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ type: "system", subtype: "init", session_id: "sess-1" });
    expect(JSON.parse(lines[1]!)).toEqual({ type: "assistant", message: { content: "Hello" } });
  });

  it("creates the transcript directory if it does not exist", async () => {
    const nestedDir = path.join(tmpDir, "nested", "dir");
    const context: TranscriptContext = { type: "issue", identifier: "issue-1" };
    const writer = new TranscriptWriter(nestedDir, context);
    await writer.open();
    await writer.write({ type: "system", subtype: "init" });
    await writer.close();

    const files = await fs.readdir(nestedDir);
    expect(files).toHaveLength(1);
    expect(files[0]!).toMatch(/\.jsonl$/);
  });

  it("exposes the file path after open", async () => {
    const context: TranscriptContext = { type: "review", identifier: "review-pr-5" };
    const writer = new TranscriptWriter(tmpDir, context);
    expect(writer.filePath).toBeUndefined();
    await writer.open();
    expect(writer.filePath).toBeDefined();
    expect(writer.filePath).toMatch(/review-pr-5\.jsonl$/);
    await writer.close();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/transcript-writer.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement transcript writer**

Create `src/transcript-writer.ts`:

```typescript
import fs from "node:fs/promises";
import { createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";

export interface TranscriptContext {
  type: "issue" | "review";
  identifier: string;
}

export function buildTranscriptFilename(context: TranscriptContext, now: Date = new Date()): string {
  const timestamp = now.toISOString().replaceAll(":", "-");
  return `${timestamp}-${context.identifier}.jsonl`;
}

export class TranscriptWriter {
  private dir: string;
  private context: TranscriptContext;
  private stream: WriteStream | undefined;
  private _filePath: string | undefined;

  constructor(dir: string, context: TranscriptContext) {
    this.dir = dir;
    this.context = context;
  }

  get filePath(): string | undefined {
    return this._filePath;
  }

  async open(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const filename = buildTranscriptFilename(this.context);
    this._filePath = path.join(this.dir, filename);
    this.stream = createWriteStream(this._filePath, { flags: "a" });
  }

  async write(message: Record<string, unknown>): Promise<void> {
    if (!this.stream) {
      throw new Error("TranscriptWriter is not open");
    }
    return new Promise((resolve, reject) => {
      this.stream!.write(JSON.stringify(message) + "\n", (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    if (!this.stream) {
      return;
    }
    return new Promise((resolve, reject) => {
      this.stream!.end((err: Error | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/transcript-writer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/transcript-writer.ts test/transcript-writer.test.ts
git commit -m "Add TranscriptWriter for JSONL session transcript capture"
```

---

### Task 6: Integrate transcript capture into session runner

**Files:**
- Modify: `src/session-runner.ts`
- Modify: `test/session-runner.test.ts`

**Step 1: Write failing tests for transcript capture in session runner**

Add to `test/session-runner.test.ts`:

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Add tmpDir management at top level of describe block:
let tmpDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbadger-session-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Add new test cases:
it("writes transcript to disk when transcriptContext is provided", async () => {
  const successResult = makeSuccessResult();
  const initMsg = { type: "system", subtype: "init", session_id: "test-session-id" };
  const assistantMsg = { type: "assistant", message: { content: "Working on it..." } };
  mockQueryStream([initMsg, assistantMsg, successResult]);

  await runSession("Say hello", {}, undefined, {
    transcriptDir: tmpDir,
    transcriptContext: { type: "issue", identifier: "issue-42" },
  });

  const files = await fs.readdir(tmpDir);
  expect(files).toHaveLength(1);
  expect(files[0]!).toMatch(/issue-42\.jsonl$/);

  const content = await fs.readFile(path.join(tmpDir, files[0]!), "utf-8");
  const lines = content.trim().split("\n").map((l) => JSON.parse(l));
  expect(lines).toHaveLength(3);
  expect(lines[0]).toEqual(initMsg);
  expect(lines[2]).toMatchObject({ type: "result", subtype: "success" });
});

it("does not write transcript when transcriptContext is not provided", async () => {
  mockQueryStream([makeSuccessResult()]);
  await runSession("Say hello");

  // tmpDir should be empty since no transcript was requested
  const files = await fs.readdir(tmpDir);
  expect(files).toHaveLength(0);
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/session-runner.test.ts`
Expected: FAIL — `runSession` doesn't accept a 4th parameter.

**Step 3: Implement transcript integration in session runner**

Modify `src/session-runner.ts` to add transcript support:

```typescript
import { query, type Options, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { TranscriptWriter, type TranscriptContext } from "./transcript-writer.js";
import { logger } from "./logger.js";

export interface TranscriptOptions {
  transcriptDir: string;
  transcriptContext: TranscriptContext;
}

async function collectResult(
  stream: AsyncIterable<SDKMessage>,
  writer: TranscriptWriter | undefined,
): Promise<SDKResultMessage> {
  let result: SDKResultMessage | undefined;
  for await (const message of stream) {
    if (writer) {
      await writer.write(message as unknown as Record<string, unknown>);
    }
    if (message.type === "result") {
      result = message;
    }
  }

  if (!result) {
    throw new Error("Session ended without a result message");
  }
  return result;
}

function buildAbortController(options: Options, timeoutMs?: number) {
  if (options.abortController) {
    return { controller: options.abortController, timeoutId: undefined };
  }

  if (timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return { controller, timeoutId };
  }

  return { controller: undefined, timeoutId: undefined };
}

export async function runSession(
  prompt: string,
  options?: Options,
  timeoutMs?: number,
  transcript?: TranscriptOptions,
): Promise<SDKResultMessage> {
  const sdkOptions = options ?? {};
  const { controller: abortController, timeoutId } = buildAbortController(sdkOptions, timeoutMs);

  let writer: TranscriptWriter | undefined;
  if (transcript) {
    writer = new TranscriptWriter(transcript.transcriptDir, transcript.transcriptContext);
    await writer.open();
  }

  try {
    const result = await collectResult(
      query({ prompt, options: { ...sdkOptions, abortController } }),
      writer,
    );

    if (writer?.filePath) {
      logger.info({ sessionId: result.session_id, transcriptFile: writer.filePath }, "Session transcript saved");
    }

    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (writer) {
      await writer.close();
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/session-runner.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test`
Expected: PASS — existing handler tests still work because the 4th parameter is optional.

**Step 6: Commit**

```bash
git add src/session-runner.ts test/session-runner.test.ts
git commit -m "Integrate transcript capture into session runner"
```

---

### Task 7: Transcript cleanup module

**Files:**
- Create: `src/transcript-cleanup.ts`
- Create: `test/transcript-cleanup.test.ts`

**Step 1: Write failing tests for transcript cleanup**

Create `test/transcript-cleanup.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { cleanupTranscripts } from "../src/transcript-cleanup.js";

let tmpDir: string;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbadger-cleanup-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createFileWithAge(dir: string, name: string, ageDays: number): Promise<void> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, "test content");
  const pastTime = new Date(Date.now() - ageDays * MS_PER_DAY);
  await fs.utimes(filePath, pastTime, pastTime);
}

describe("cleanupTranscripts", () => {
  it("deletes JSONL files older than retention days", async () => {
    await createFileWithAge(tmpDir, "old-transcript.jsonl", 31);
    await cleanupTranscripts(tmpDir, 30);
    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(0);
  });

  it("keeps JSONL files newer than retention days", async () => {
    await createFileWithAge(tmpDir, "recent-transcript.jsonl", 5);
    await cleanupTranscripts(tmpDir, 30);
    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(1);
  });

  it("ignores non-JSONL files", async () => {
    await createFileWithAge(tmpDir, "old-file.txt", 31);
    await cleanupTranscripts(tmpDir, 30);
    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(1);
  });

  it("handles non-existent directory without throwing", async () => {
    const missingDir = path.join(tmpDir, "does-not-exist");
    await expect(cleanupTranscripts(missingDir, 30)).resolves.toBeUndefined();
  });

  it("deletes multiple old files in one pass", async () => {
    await createFileWithAge(tmpDir, "old-1.jsonl", 40);
    await createFileWithAge(tmpDir, "old-2.jsonl", 35);
    await createFileWithAge(tmpDir, "recent.jsonl", 10);
    await cleanupTranscripts(tmpDir, 30);
    const files = await fs.readdir(tmpDir);
    expect(files).toEqual(["recent.jsonl"]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/transcript-cleanup.test.ts`
Expected: FAIL — module does not exist.

**Step 3: Implement transcript cleanup**

Create `src/transcript-cleanup.ts`:

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function cleanupTranscripts(dir: string, retentionDays: number): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  const cutoff = Date.now() - retentionDays * MS_PER_DAY;

  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) {
      continue;
    }

    const filePath = path.join(dir, entry);
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        logger.info({ file: entry }, "Deleted expired transcript");
      }
    } catch (err) {
      logger.warn({ file: entry, error: err }, "Failed to clean up transcript");
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test test/transcript-cleanup.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/transcript-cleanup.ts test/transcript-cleanup.test.ts
git commit -m "Add transcript cleanup module with age-based deletion"
```

---

### Task 8: Wire transcript capture and cleanup into handlers

**Files:**
- Modify: `src/handlers/issues-assigned.ts`
- Modify: `src/handlers/pull-request-review-submitted.ts`
- Modify: `src/server.ts` (add `transcriptDir` and `transcriptRetentionDays` to `HandlerConfig`)
- Modify: `src/handler-config.ts`
- Modify: `src/index.ts` (pass new config fields)
- Modify: `test/issues-assigned.test.ts`
- Modify: `test/pull-request-review-submitted.test.ts`

**Step 1: Add transcript fields to HandlerConfig**

In `src/handler-config.ts`:

```typescript
export interface HandlerConfig {
  botUsername: string;
  targetRepo: string;
  sessionTimeoutHours: number;
  maxCiRetries: number;
  transcriptDir: string;
  transcriptRetentionDays: number;
}
```

**Step 2: Update index.ts to pass new config fields**

In `src/index.ts`, update the `handlerConfig` creation:

```typescript
const handlerConfig: HandlerConfig = {
  botUsername: config.botUsername,
  targetRepo: config.targetRepo,
  sessionTimeoutHours: config.sessionTimeoutHours,
  maxCiRetries: config.maxCiRetries,
  transcriptDir: config.transcriptDir,
  transcriptRetentionDays: config.transcriptRetentionDays,
};
```

**Step 3: Update test fixtures**

In both `test/issues-assigned.test.ts` and `test/pull-request-review-submitted.test.ts`, update the `config` in `makeDeps()`:

```typescript
config: {
  botUsername: "qbadger",
  targetRepo: "example-org/example-repo",
  sessionTimeoutHours: 6,
  maxCiRetries: 5,
  transcriptDir: "/tmp/test-transcripts",
  transcriptRetentionDays: 30,
},
```

**Step 4: Write failing test for transcript context in issues-assigned**

Add to `test/issues-assigned.test.ts`:

```typescript
it("passes transcript context to runSession", async () => {
  await handleIssuesAssigned(makePayload(), deps);
  expect(deps.runSession).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Object),
    6 * 60 * 60 * 1000,
    expect.objectContaining({
      transcriptDir: "/tmp/test-transcripts",
      transcriptContext: { type: "issue", identifier: "issue-42" },
    }),
  );
});
```

**Step 5: Write failing test for transcript context in pull-request-review-submitted**

Add to `test/pull-request-review-submitted.test.ts`:

```typescript
it("passes transcript context to runSession", async () => {
  await handlePullRequestReviewSubmitted(makePayload(), deps);
  expect(deps.runSession).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Object),
    6 * 60 * 60 * 1000,
    expect.objectContaining({
      transcriptDir: "/tmp/test-transcripts",
      transcriptContext: { type: "review", identifier: "review-pr-100" },
    }),
  );
});
```

**Step 6: Run tests to verify they fail**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test`
Expected: FAIL — handlers don't pass transcript options yet.

**Step 7: Update issues-assigned handler**

In `src/handlers/issues-assigned.ts`, import `TranscriptOptions` and `cleanupTranscripts`:

```typescript
import type { TranscriptOptions } from "../session-runner.js";
import { cleanupTranscripts } from "../transcript-cleanup.js";
```

Update `runSessionForIssue` to pass transcript options:

```typescript
async function runSessionForIssue(issueNumber: number, issueSummary: IssueSummary, deps: HandlerDeps): Promise<void> {
  const prompt = buildPrompt(issueSummary, deps.config);
  const timeoutMs = deps.config.sessionTimeoutHours * MS_PER_HOUR;
  const transcript: TranscriptOptions = {
    transcriptDir: deps.config.transcriptDir,
    transcriptContext: { type: "issue", identifier: `issue-${issueNumber}` },
  };
  const result = await deps.runSession(prompt, {}, timeoutMs, transcript);

  if (result.is_error) {
    const errorDetail = "errors" in result ? result.errors.join("\n") : "Unknown error";
    await notifyFailure(deps.github, issueNumber, new Error(errorDetail));
  }
}
```

Add cleanup call at the end of `runPipeline`, in the `try` block after `await runSessionForIssue(...)`:

```typescript
await cleanupTranscripts(deps.config.transcriptDir, deps.config.transcriptRetentionDays);
```

**Step 8: Update pull-request-review-submitted handler**

In `src/handlers/pull-request-review-submitted.ts`, import `TranscriptOptions` and `cleanupTranscripts`:

```typescript
import type { TranscriptOptions } from "../session-runner.js";
import { cleanupTranscripts } from "../transcript-cleanup.js";
```

Update `runReviewSession`:

```typescript
async function runReviewSession(context: ReviewContext, deps: HandlerDeps): Promise<void> {
  const prompt = buildReviewPrompt(context, deps.config);
  const timeoutMs = deps.config.sessionTimeoutHours * MS_PER_HOUR;
  const transcript: TranscriptOptions = {
    transcriptDir: deps.config.transcriptDir,
    transcriptContext: { type: "review", identifier: `review-pr-${context.prNumber}` },
  };
  const result = await deps.runSession(prompt, {}, timeoutMs, transcript);

  if (result.is_error) {
    const errorDetail = "errors" in result ? result.errors.join("\n") : "Unknown error";
    await deps.github.createComment(context.prNumber, failureComment(errorDetail));
  }

  await cleanupTranscripts(deps.config.transcriptDir, deps.config.transcriptRetentionDays);
}
```

**Step 9: Update HandlerDeps runSession type**

In `src/server.ts`, update the `HandlerDeps` type to match the new `runSession` signature:

```typescript
import type { TranscriptOptions } from "./session-runner.js";

export interface HandlerDeps {
  github: GitHubService;
  runSession: (prompt: string, options?: Options, timeoutMs?: number, transcript?: TranscriptOptions) => Promise<SDKResultMessage>;
  config: HandlerConfig;
}
```

Import the necessary types from the SDK:

```typescript
import type { Options, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
```

Remove the old `typeof RunSessionFn` import.

**Step 10: Run tests to verify they pass**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm test`
Expected: PASS

**Step 11: Run full check**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm check`
Expected: PASS

**Step 12: Commit**

```bash
git add src/handler-config.ts src/handlers/issues-assigned.ts src/handlers/pull-request-review-submitted.ts src/server.ts src/index.ts test/issues-assigned.test.ts test/pull-request-review-submitted.test.ts
git commit -m "Wire transcript capture and cleanup into handlers"
```

---

### Task 9: Add .gitignore entries for logs and transcripts

**Files:**
- Modify: `.gitignore`

**Step 1: Add entries**

Add to `.gitignore`:

```
# Runtime output
logs/
transcripts/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "Add logs/ and transcripts/ to .gitignore"
```

---

### Task 10: Final verification

**Step 1: Run full check suite**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && pnpm check`
Expected: PASS (build + lint:types + lint + test all pass)

**Step 2: Review all changes**

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && git log --oneline origin/main..HEAD`
Expected: See all commits from this implementation.

Run: `cd /Users/fhwang/Code/QBadger/13-logging-session-transcripts && git diff origin/main --stat`
Expected: See all changed files.
