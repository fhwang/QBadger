# Logging & Session Transcripts Design

## Overview

Enhance QBadger's logging with structured context fields, sensitive field redaction, session transcript capture to disk, and log rotation to prevent disk fill.

## Logger Enhancement

Enhance `src/logger.ts` to configure Pino with:

- **File output via pino-roll**: operational logs go to a configurable file path (env var `LOG_DIR`, default `./logs`), rotated at 50MB, keeping 10 files. Stdout logging remains for dev.
- **Redaction**: path-based redaction for known secret fields (`*.githubToken`, `*.githubWebhookSecret`, `*.anthropicApiKey`, `*.token`, `*.apiKey`) plus a custom serializer that scans string values for secret prefixes (`ghp_`, `sk-ant-`, `github_pat_`).
- **Base context**: the root logger includes `{ repo: config.targetRepo }` so every log line carries the repo field.

The logger export changes from a pre-built instance to a `createLogger(config)` function, called at startup in `index.ts`. Handler child loggers continue working as-is — they just add context fields like `{ issueNumber, sessionId }`.

## Transcript Capture

Modify `session-runner.ts` to capture all `SDKMessage` objects during streaming and write them to disk as JSONL.

- **New config fields**: `TRANSCRIPT_DIR` env var (default `./transcripts`). Added to `AppConfig`.
- **`runSession` signature change**: add an optional `transcriptContext` parameter with fields like `{ type: 'issue', identifier: 'issue-42' }` or `{ type: 'review', identifier: 'review-pr-17' }`. When provided, transcripts are saved.
- **Write strategy**: open a file write stream at session start, append each `SDKMessage` as a JSON line as it arrives. Close on session end. Crash-safe — partial transcripts survive.
- **Filename**: `<ISO-timestamp>-<identifier>.jsonl`, e.g. `2026-03-15T10-30-00Z-issue-42.jsonl`. Timestamps use UTC with colons replaced by hyphens for filesystem safety.
- **Session ID logging**: the SDK result includes `session_id`. Once the result arrives, log it at info level so it's correlated with the transcript file.

The handlers pass the appropriate `transcriptContext` when calling `runSession`. The transcript directory is created at startup if it doesn't exist.

## Transcript Cleanup

Age-based cleanup function that runs after each session completes:

- Scans `TRANSCRIPT_DIR` for `.jsonl` files
- Deletes files older than a configurable age (`TRANSCRIPT_RETENTION_DAYS` env var, default 30)
- Logs each deletion at info level
- Errors during cleanup are logged but don't prevent operation

Cleanup runs after each session in the handlers, naturally paced with activity.

## Context Fields in Handlers

Standardized child logger context:

- **issues-assigned**: `{ issueNumber, assignee, branchName }`
- **pull-request-review-submitted**: `{ prNumber, branchName, reviewId, reviewerLogin }`
- **server.ts webhook routing**: `{ event, action }` (unchanged)
- **session-runner**: logs `{ sessionId, transcriptFile }` on session completion

No `containerId` field for now — added at the container integration point later.

## Testing Strategy

- **Logger tests**: verify redaction of secret patterns in log output. Test child loggers inherit base context.
- **Transcript tests**: mock SDK stream, verify JSONL file created with expected messages and filename format.
- **Cleanup tests**: create files with old timestamps, verify deletion. Verify recent files kept. Verify errors don't throw.
- **Handler tests**: update to pass `transcriptContext`, verify correct context passed to `runSession`.

All filesystem tests use tmp directories with Vitest `beforeEach`/`afterEach` for setup and teardown.
