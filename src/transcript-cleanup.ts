import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger.js";
import { MS_PER_DAY } from "./time-constants.js";

async function processEntry(dir: string, entry: string, cutoff: number): Promise<void> {
  if (!entry.endsWith(".jsonl")) {
    return;
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

export async function cleanupTranscripts(dir: string, retentionDays: number): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  const cutoff = Date.now() - retentionDays * MS_PER_DAY;

  for (const entry of entries) {
    await processEntry(dir, entry, cutoff);
  }
}
