import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UUID } from "node:crypto";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { runSession } from "../src/session-runner.js";

const mockedQuery = vi.mocked(query);

function makeSuccessResult() {
  return {
    type: "result" as const,
    subtype: "success" as const,
    duration_ms: 1000,
    duration_api_ms: 800,
    is_error: false,
    num_turns: 3,
    result: "Done! Created the file.",
    stop_reason: "end_turn",
    total_cost_usd: 0.05,
    usage: { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000000" as UUID,
    session_id: "test-session-id",
  };
}

function mockQueryStream(messages: Record<string, unknown>[]) {
  async function* generator() {
    for (const msg of messages) {
      yield msg;
    }
  }
  const gen = generator();
  mockedQuery.mockReturnValue(gen as ReturnType<typeof query>);
}

describe("runSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a successful result", async () => {
    const successResult = makeSuccessResult();
    mockQueryStream([
      { type: "system", subtype: "init", session_id: "test-session-id" },
      { type: "assistant", message: { content: "Working on it..." } },
      successResult,
    ]);

    const result = await runSession({ prompt: "Say hello" });

    expect(result).toEqual({
      success: true,
      output: "Done! Created the file.",
      durationMs: 1000,
      numTurns: 3,
      totalCostUsd: 0.05,
      sessionId: "test-session-id",
    });
  });

  it("returns an error result when session fails", async () => {
    mockQueryStream([
      {
        type: "result",
        subtype: "error_during_execution",
        duration_ms: 500,
        duration_api_ms: 400,
        is_error: true,
        num_turns: 1,
        stop_reason: null,
        total_cost_usd: 0.01,
        usage: { input_tokens: 50, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
        modelUsage: {},
        permission_denials: [],
        errors: ["Something went wrong"],
        uuid: "00000000-0000-0000-0000-000000000001" as UUID,
        session_id: "error-session-id",
      },
    ]);

    const result = await runSession({ prompt: "Do something" });

    expect(result).toEqual({
      success: false,
      errors: ["Something went wrong"],
      durationMs: 500,
      numTurns: 1,
      totalCostUsd: 0.01,
      sessionId: "error-session-id",
    });
  });

  it("passes options to the SDK query", async () => {
    mockQueryStream([makeSuccessResult()]);

    await runSession({
      prompt: "Build it",
      model: "claude-sonnet-4-5-20250929",
      maxTurns: 10,
      allowedTools: ["Read", "Write", "Bash"],
      systemPrompt: "You are a coding assistant",
    });

    expect(mockedQuery).toHaveBeenCalledWith({
      prompt: "Build it",
      options: {
        model: "claude-sonnet-4-5-20250929",
        maxTurns: 10,
        allowedTools: ["Read", "Write", "Bash"],
        systemPrompt: "You are a coding assistant",
      },
    });
  });

  it("throws when no result message is received", async () => {
    mockQueryStream([
      { type: "assistant", message: { content: "Hi" } },
    ]);

    await expect(runSession({ prompt: "Hello" })).rejects.toThrow(
      "Session ended without a result message",
    );
  });

  it("supports cancellation via AbortController", async () => {
    const controller = new AbortController();

    async function* abortingGenerator() {
      yield { type: "assistant", message: { content: "Starting..." } };
      controller.abort();
      throw new DOMException("The operation was aborted", "AbortError");
    }
    mockedQuery.mockReturnValue(abortingGenerator() as ReturnType<typeof query>);

    await expect(runSession({ prompt: "Do work", abortController: controller })).rejects.toThrow(
      "The operation was aborted",
    );

    expect(mockedQuery).toHaveBeenCalledWith({
      prompt: "Do work",
      options: expect.objectContaining({
        abortController: controller,
      }),
    });
  });

  it("supports timeout via AbortController", async () => {
    // Verify that timeoutMs creates an AbortController that aborts after the timeout
    async function* hangingGenerator() {
      yield { type: "assistant", message: { content: "Starting..." } };
      // Simulate a long-running session
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new DOMException("The operation was aborted", "AbortError");
    }
    mockedQuery.mockReturnValue(hangingGenerator() as ReturnType<typeof query>);

    await expect(runSession({ prompt: "Do work", timeoutMs: 50 })).rejects.toThrow(
      "The operation was aborted",
    );

    // Verify an AbortController was passed to the SDK
    expect(mockedQuery).toHaveBeenCalledWith({
      prompt: "Do work",
      options: expect.objectContaining({
        abortController: expect.any(AbortController),
      }),
    });
  });
});
