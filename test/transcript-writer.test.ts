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
