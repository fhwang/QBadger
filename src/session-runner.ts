import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export interface SessionOptions {
  prompt: string;
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  systemPrompt?: string;
  abortController?: AbortController;
  timeoutMs?: number;
}

export interface SessionResult {
  success: boolean;
  output?: string;
  errors?: string[];
  durationMs: number;
  numTurns: number;
  totalCostUsd: number;
  sessionId: string;
}

function toSessionResult(message: SDKMessage): SessionResult | undefined {
  if (message.type !== "result") {
    return undefined;
  }

  if (message.subtype === "success") {
    return {
      success: true,
      output: message.result,
      durationMs: message.duration_ms,
      numTurns: message.num_turns,
      totalCostUsd: message.total_cost_usd,
      sessionId: message.session_id,
    };
  }

  return {
    success: false,
    errors: message.errors,
    durationMs: message.duration_ms,
    numTurns: message.num_turns,
    totalCostUsd: message.total_cost_usd,
    sessionId: message.session_id,
  };
}

function buildAbortController(options: SessionOptions) {
  if (options.abortController) {
    return { controller: options.abortController, timeoutId: undefined };
  }

  if (options.timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
    return { controller, timeoutId };
  }

  return { controller: undefined, timeoutId: undefined };
}

async function consumeStream(stream: AsyncIterable<SDKMessage>): Promise<SessionResult> {
  let result: SessionResult | undefined;
  for await (const message of stream) {
    result = toSessionResult(message) ?? result;
  }

  if (!result) {
    throw new Error("Session ended without a result message");
  }
  return result;
}

export async function runSession(options: SessionOptions): Promise<SessionResult> {
  const { controller: abortController, timeoutId } = buildAbortController(options);

  try {
    return await consumeStream(query({
      prompt: options.prompt,
      options: {
        model: options.model,
        maxTurns: options.maxTurns,
        allowedTools: options.allowedTools,
        systemPrompt: options.systemPrompt,
        abortController,
      },
    }));
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
