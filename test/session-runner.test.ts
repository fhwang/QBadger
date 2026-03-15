import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { runSession } from "../src/session-runner.js";
import { TranscriptWriter } from "../src/transcript-writer.js";

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
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qbadger-session-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns a successful result", async () => {
    const successResult = makeSuccessResult();
    mockQueryStream([
      { type: "system", subtype: "init", session_id: "test-session-id" },
      { type: "assistant", message: { content: "Working on it..." } },
      successResult,
    ]);

    const result = await runSession("Say hello");

    expect(result).toEqual(successResult);
  });

  it("returns an error result when session fails", async () => {
    const errorResult = {
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
    };
    mockQueryStream([errorResult]);

    const result = await runSession("Do something");

    expect(result).toEqual(errorResult);
  });

  it("passes options to the SDK query", async () => {
    mockQueryStream([makeSuccessResult()]);

    await runSession("Build it", {
      model: "claude-sonnet-4-5-20250929",
      maxTurns: 10,
      allowedTools: ["Read", "Write", "Bash"],
      systemPrompt: "You are a coding assistant",
    });

    expect(mockedQuery).toHaveBeenCalledWith({
      prompt: "Build it",
      options: expect.objectContaining({
        model: "claude-sonnet-4-5-20250929",
        maxTurns: 10,
        allowedTools: ["Read", "Write", "Bash"],
        systemPrompt: "You are a coding assistant",
      }),
    });
  });

  it("throws when no result message is received", async () => {
    mockQueryStream([
      { type: "assistant", message: { content: "Hi" } },
    ]);

    await expect(runSession("Hello")).rejects.toThrow(
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

    await expect(
      runSession("Do work", { abortController: controller }),
    ).rejects.toThrow("The operation was aborted");

    expect(mockedQuery).toHaveBeenCalledWith({
      prompt: "Do work",
      options: expect.objectContaining({
        abortController: controller,
      }),
    });
  });

  it("supports timeout via AbortController", async () => {
    async function* hangingGenerator() {
      yield { type: "assistant", message: { content: "Starting..." } };
      await new Promise((resolve) => setTimeout(resolve, 100));
      throw new DOMException("The operation was aborted", "AbortError");
    }
    mockedQuery.mockReturnValue(hangingGenerator() as ReturnType<typeof query>);

    await expect(runSession("Do work", {}, 50)).rejects.toThrow(
      "The operation was aborted",
    );

    expect(mockedQuery).toHaveBeenCalledWith({
      prompt: "Do work",
      options: expect.objectContaining({
        abortController: expect.any(AbortController),
      }),
    });
  });

  it("writes transcript to disk when a writer is provided", async () => {
    const successResult = makeSuccessResult();
    const initMsg = { type: "system", subtype: "init", session_id: "test-session-id" };
    const assistantMsg = { type: "assistant", message: { content: "Working on it..." } };
    mockQueryStream([initMsg, assistantMsg, successResult]);

    const writer = new TranscriptWriter(tmpDir, "issue-42");
    await writer.open();
    await runSession("Say hello", {}, undefined, writer);

    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]!).toMatch(/issue-42\.jsonl$/);

    const content = await fs.readFile(path.join(tmpDir, files[0]!), "utf-8");
    const lines = content.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual(initMsg);
    expect(lines[2]).toMatchObject({ type: "result", subtype: "success" });
  });

  it("does not write transcript when transcript options are not provided", async () => {
    mockQueryStream([makeSuccessResult()]);
    await runSession("Say hello");

    const files = await fs.readdir(tmpDir);
    expect(files).toHaveLength(0);
  });
});
