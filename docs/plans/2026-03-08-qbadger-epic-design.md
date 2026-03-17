# QBadger Epic Plan

## Overview

QBadger is a custom async AI automation system built from scratch on the Claude Code SDK. It receives GitHub webhooks, spawns Claude Code sessions in Docker containers, and manages the full lifecycle from issue assignment through PR creation, CI monitoring, and review followup.

- **Language:** TypeScript
- **Runtime:** Node.js
- **Package manager:** pnpm
- **Target repo:** `example-org/example-repo`
- **Hosting:** EC2 (Amazon Linux 2023), QBadger runs directly as a systemd service
- **Worker isolation:** Docker containers for Claude Code sessions
- **Webhook delivery:** Cloudflare Tunnel (no inbound security group rules)
- **Monitoring:** CloudWatch metrics + alarms, SNS email notifications
- **Infrastructure-as-code:** CloudFormation (all resources)
- **Reference codebase:** `~/Code/vendor/claude-hub/` (patterns and ideas only)
- **Existing CF reference:** `~/Code/ai-rig/main/agent-orchestrator/` (reusable patterns for EC2 + CloudWatch + Secrets Manager + Cloudflare Tunnel)

---

## Subtask 1: Project Scaffolding

Set up the TypeScript project with build tooling, linting, testing, and basic project structure.

- TypeScript + tsconfig
- ESLint (no Prettier)
- Vitest for testing
- pnpm scripts: `build`, `test`, `lint`, `dev`
- Directory structure: `src/`, `test/`, `scripts/`
- `.gitignore`, `CLAUDE.md` with project conventions

**Validation:** `pnpm build`, `pnpm test`, and `pnpm lint` all pass on an empty project.

---

## Subtask 2: GitHub Webhook Server

Express server that receives GitHub webhooks, verifies signatures (HMAC-SHA256), parses event types, and routes to handlers.

- Webhook signature verification using `x-hub-signature-256` header
- Event type extraction and routing based on `x-github-event` header + `action` field
- Stub handlers for: `issues.assigned`, `issue_comment.created`, `check_suite.completed`, `pull_request_review.submitted`
- Health check endpoint (`/health`)
- Structured logging with pino

**Validation:** Unit tests that send mock webhook payloads with valid/invalid signatures and verify correct routing and rejection.

---

## Subtask 3: Configuration & Environment Management

Centralized config module that loads from environment variables with validation and sensible defaults.

- Required: `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`
- Configurable: bot username, target repo (`example-org/example-repo`), max concurrent sessions (default 10), session timeout (default 6 hours), max CI retries (default 5)
- App fails to start with clear error messages when required env vars are missing

**Validation:** Tests confirm required vars are enforced, defaults are applied, and overrides work.

---

## Subtask 4: Claude Code SDK Session Runner

Core module that spawns Claude Code SDK sessions with a given prompt, receives streaming results, and captures output. Runs locally for development (no Docker).

- Uses `@anthropic-ai/claude-code-sdk` to create sessions
- Configurable: model, max turns, allowed tools, system prompt
- Captures conversation messages and tool usage
- Timeout handling and graceful cancellation
- Returns structured result (success/failure, output, artifacts like file paths, branch names)

**Validation:** Integration test that spawns a real Claude Code session with a trivial prompt and verifies completion. Skippable in CI via env flag.

---

## Subtask 5: Docker Container Execution

Wraps the session runner in Docker container isolation. Each task gets its own container.

- Dockerfile for the worker container (Node.js, git, gh CLI, Claude Code SDK)
- Container lifecycle management (create, start, monitor, stop, cleanup)
- Volume mounts for GitHub credentials and Claude auth
- Environment variable injection (tokens, repo info, task context)
- Container timeout enforcement (default 6 hours, configurable)
- Containers run as non-root user
- Worker container build script

**Validation:** Test that spawns a container, runs a simple Claude Code session inside it, and verifies cleanup. Verify non-root execution.

---

## Subtask 6: GitHub API Service

Module for interacting with GitHub via Octokit.

- Read issue details (title, body, labels, assignee)
- Create branches from default branch
- Create and update PRs
- Post comments on issues and PRs
- Read PR review comments
- Read check suite / check run status
- Repo passed as config, scoped to `example-org/example-repo` initially

**Validation:** Unit tests with mocked Octokit. One integration test that reads a real issue from `example-org/example-repo` (skippable in CI).

---

## Subtask 7: Issue-to-PR Pipeline

End-to-end flow: GitHub issue assigned to bot → Claude Code implements it → PR opened.

- Webhook handler for `issues.assigned` filters for bot username
- Builds prompt from issue title + body
- Creates feature branch (`qbadger/<issue-number>-<slug>`)
- Spawns Claude Code session with instructions to implement the issue on that branch
- CI-aware session prompt: Claude pushes code, monitors CI via `gh`, reads failure logs, fixes and retries up to 5 times
- On completion, opens a PR linking back to the issue
- On session failure or timeout, posts a comment on the issue explaining what happened

**Validation:** End-to-end test using a test issue on `example-org/example-repo`. Verify branch created, PR opened. Dry-run mode available.

---

## Subtask 8: CI-Aware Session Prompting

Claude Code sessions handle the CI feedback loop internally.

- Session prompt instructs Claude to:
  - Push code to the feature branch
  - Check CI status via `gh run list` / `gh run watch`
  - On failure: read logs via `gh run view --log-failed`, diagnose, fix, push again
  - Repeat up to 5 times
  - On final success or max retries: post a summary comment on the PR
- QBadger sets container timeout to 6 hours to accommodate CI wait times
- If container times out, QBadger posts a timeout comment on the PR

**Validation:** Verify session prompt includes CI monitoring instructions. Integration test with a real PR that has CI configured. Verify timeout handling.

---

## Subtask 9: PR Review → Automatic Followup

When a human leaves review comments on a QBadger-created PR, spawn a new Claude Code session to address feedback.

- Webhook handler for `pull_request_review.submitted`
- Filters to QBadger-owned PRs only
- Collects all review comments (inline and top-level)
- Spawns Claude Code session on the PR branch with: original issue, current diff, review feedback
- Session prompt instructs Claude to categorize each comment:
  - **Code change requested** → make the change, push commits
  - **Clarification/question** → reply to the specific review comment with an explanation via `gh`
  - **Mix of both** → handle each appropriately
- If code was changed, follows CI-aware flow (monitor CI, fix failures, up to 5 retries)
- Posts summary comment tagging reviewer when all feedback addressed
- On session failure or timeout, posts a comment explaining what happened

**Validation:** Unit test with mock reviews containing both change requests and questions. Verify prompt handles both modes. Integration test confirming reply to individual review comments via `gh`.

---

## Subtask 10: Failure Notifications

QBadger posts to GitHub only when something goes wrong.

- On session failure: post comment on issue/PR with error context
- On session timeout: post comment on issue/PR explaining timeout
- No progress comments on the happy path — the PR itself is the success signal

**Validation:** Verify failure and timeout scenarios produce actionable comments. Verify no comments on happy path.

---

## Subtask 11: Logging & Session Transcripts

Structured logging throughout QBadger.

- Pino logger with child loggers per request/session
  - Context fields: repo, issue number, session ID, container ID
- Sensitive field redaction (tokens, API keys)
- Claude Code session transcripts captured and stored to local filesystem
- Log rotation or size limits to prevent disk fill

**Validation:** Verify logs include expected context fields. Verify transcripts saved to disk. Verify tokens don't appear in log output.

---

## Subtask 12: Guardrails & Limits

Prevent runaway sessions and unexpected costs.

- Max concurrent sessions: 10 (configurable)
- Per-session timeout: 6 hours (configurable)
- Max CI retries: 5 (in session prompt)
- Kill switch: endpoint or signal that terminates all running sessions and stops accepting new work
- Session queue: when max concurrency reached, new sessions wait

**Validation:** Test that an 11th session is queued when max concurrency is 10. Test kill switch stops all running containers.

---

## Subtask 13: Instance Monitoring & Alerting

EC2-level monitoring via CloudWatch (defined in CloudFormation, see Subtask 15).

- CloudWatch Agent collecting custom metrics: CPU, memory, disk usage
- Docker daemon process monitoring
- CloudWatch alarms:
  - CPU > 80% sustained 5 min
  - Memory > 85%
  - Disk > 80%
  - Docker daemon down
  - EC2 status check failure (auto-recovery)
- SNS topic with email subscription for all alarms
- Per-container resource tracking: log CPU/memory at session start and end

**Validation:** Verify CloudWatch alarms configured and fire on threshold breach. Verify SNS delivers email. Verify per-container stats in logs.

---

## Subtask 14: Worker Container Image

Dockerfile and build tooling for the Claude Code worker container.

- Dockerfile: Node.js, git, gh CLI, Claude Code SDK, pnpm
- Non-root user execution
- Build script for the image
- Local dev: `pnpm dev` runs QBadger directly, workers still spawn as Docker containers

**Validation:** Worker container builds and runs a trivial Claude Code session. `pnpm dev` starts QBadger locally.

---

## Subtask 15: EC2 Deployment via CloudFormation

All infrastructure defined in CloudFormation. Two stacks:

**Secrets stack** (deploy once, persists across EC2 rebuilds):
- `qbadger/cloudflare-tunnel-token`
- `qbadger/anthropic-api-key`
- `qbadger/github-bot-token`
- `qbadger/github-webhook-secret`

**Instance stack:**
- EC2: t3.large, Amazon Linux 2023, 50 GB gp3 encrypted EBS
- IMDSv2 required
- Security group: egress-only (no inbound rules)
- IAM role: SSM Session Manager, CloudWatch Agent, Secrets Manager (`qbadger/*`)
- SNS topic + email subscription
- CloudWatch alarms (CPU, memory, disk, dockerd, status check)
- CloudWatch log group (`/qbadger/service`, 30-day retention)
- UserData bootstrap:
  1. System packages, Docker, git
  2. Node.js 20 + pnpm
  3. GitHub CLI
  4. Cloudflared (systemd service, token from Secrets Manager via IMDS)
  5. Secrets fetch script (writes `.env`)
  6. GitHub auth setup
  7. Clone QBadger repo, `pnpm install && pnpm build`
  8. Build worker Docker image
  9. QBadger systemd service
  10. CloudWatch Agent + custom metrics config
  11. Daily Docker cleanup cron (3 AM, 24h+ containers)

**Validation:** `aws cloudformation deploy` stands up a working instance. QBadger starts and responds to health checks. Stack teardown and recreation works cleanly.

---

## Subtask 16: Cloudflare Tunnel

Route GitHub webhooks from Cloudflare to QBadger on EC2.

- Cloudflared installed and configured in Subtask 15 (UserData)
- Tunnel points to QBadger's webhook port (localhost:3000 or similar)
- GitHub webhook configured on `example-org/example-repo` with tunnel URL
- Tunnel auto-restarts on failure (systemd)

**Validation:** Send test webhook from GitHub webhook settings. Verify QBadger receives and processes it. Verify tunnel reconnects after restart.

---

## Dependency Order

```
Subtask 1: Project Scaffolding
    └─► Subtask 2: Webhook Server
    └─► Subtask 3: Config Management
        └─► Subtask 4: Claude Code SDK Runner
            └─► Subtask 5: Docker Container Execution
        └─► Subtask 6: GitHub API Service
            └─► Subtask 7: Issue-to-PR Pipeline
                └─► Subtask 8: CI-Aware Prompting
                └─► Subtask 9: PR Review Followup
        └─► Subtask 10: Failure Notifications
        └─► Subtask 11: Logging & Transcripts
        └─► Subtask 12: Guardrails & Limits
        └─► Subtask 13: Instance Monitoring (CF definition)
    └─► Subtask 14: Worker Container Image
    └─► Subtask 15: EC2 CloudFormation
    └─► Subtask 16: Cloudflare Tunnel
```

Subtasks 2–6 and 10–14 can largely be worked in parallel once scaffolding is done. Subtask 7 requires 2, 4, 5, and 6. Subtasks 8 and 9 require 7. Subtask 16 requires 15.
