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
