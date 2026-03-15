import fs from "node:fs/promises";
import { createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";

export interface TranscriptContext {
  type: "issue" | "review";
  identifier: string;
}

export function buildTranscriptFilename(context: TranscriptContext, now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
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

  write(message: Record<string, unknown>): Promise<void> {
    const stream = this.stream;
    if (!stream) {
      throw new Error("TranscriptWriter is not open");
    }
    return new Promise((resolve, reject) => {
      stream.write(JSON.stringify(message) + "\n", (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  close(): Promise<void> {
    const stream = this.stream;
    if (!stream) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      stream.end((err: Error | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
