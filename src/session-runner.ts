import { query, type Options, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { TranscriptWriter } from "./transcript-writer.js";
import { logger } from "./logger.js";

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

async function cleanup(timeoutId: ReturnType<typeof setTimeout> | undefined, writer?: TranscriptWriter): Promise<void> {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  if (writer) {
    await writer.close();
  }
}

export async function runSession(
  prompt: string,
  options?: Options,
  timeoutMs?: number,
  writer?: TranscriptWriter,
): Promise<SDKResultMessage> {
  const sdkOptions = options ?? {};
  const { controller: abortController, timeoutId } = buildAbortController(sdkOptions, timeoutMs);

  try {
    const result = await collectResult(query({
      prompt,
      options: { ...sdkOptions, abortController },
    }), writer);

    if (writer?.filePath) {
      logger.info({ sessionId: result.session_id, transcriptFile: writer.filePath }, "Session transcript saved");
    }

    return result;
  } finally {
    await cleanup(timeoutId, writer);
  }
}
