import { query, type Options, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

function findResult(stream: AsyncIterable<SDKMessage>) {
  return async (): Promise<SDKResultMessage> => {
    let result: SDKResultMessage | undefined;
    for await (const message of stream) {
      if (message.type === "result") {
        result = message;
      }
    }

    if (!result) {
      throw new Error("Session ended without a result message");
    }
    return result;
  };
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
): Promise<SDKResultMessage> {
  const sdkOptions = options ?? {};
  const { controller: abortController, timeoutId } = buildAbortController(sdkOptions, timeoutMs);

  try {
    return await findResult(query({
      prompt,
      options: { ...sdkOptions, abortController },
    }))();
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
