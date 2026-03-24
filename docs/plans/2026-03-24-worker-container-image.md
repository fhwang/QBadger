# Worker Container Image Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the Docker image and build tooling for the Claude Code worker container that runs AI sessions in isolation.

**Architecture:** The worker image is a pre-built environment containing Node.js, git, gh CLI, pnpm, and the Claude Code CLI. QBadger (the host process) spawns these containers via `ContainerRunner`, injecting prompts and credentials through environment variables and volume mounts. The image itself contains no QBadger application code — it's a generic Claude Code execution environment.

**Tech Stack:** Docker, Node.js 22, GitHub CLI, pnpm, `@anthropic-ai/claude-code` (CLI)

---

### Task 1: Create Dockerfile

**Files:**
- Create: `Dockerfile`

**Step 1: Create the Dockerfile**

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10 @anthropic-ai/claude-code

RUN useradd -m -s /bin/bash worker
USER worker
WORKDIR /home/worker

CMD ["bash"]
```

Design notes:
- `node:22-slim` matches project's `.nvmrc` (Node 22)
- System deps + gh CLI installed in a single `RUN` layer to minimize image size
- `pnpm@10` matches project's `packageManager` field (`pnpm@10.31.0`)
- `@anthropic-ai/claude-code` provides the `claude` binary the agent SDK needs
- Non-root `worker` user for security
- `CMD ["bash"]` — the actual command is overridden by `ContainerRunner` via `ContainerConfig.command`

**Step 2: Verify Dockerfile syntax**

Run: `docker build --check -f Dockerfile .` (or just proceed to build in Task 3)

---

### Task 2: Create .dockerignore

**Files:**
- Create: `.dockerignore`

**Step 1: Create .dockerignore**

The Dockerfile doesn't `COPY` any repo files, but `.dockerignore` keeps the build context small (Docker sends the entire directory to the daemon).

```
node_modules/
dist/
.git/
logs/
transcripts/
.env
.env.*
*.tsbuildinfo
cloudformation/
docs/
test/
.github/
```

---

### Task 3: Create build script

**Files:**
- Create: `scripts/build-worker.sh`

**Step 1: Create the build script**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_NAME="${IMAGE_NAME:-qbadger-worker}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building worker image: ${IMAGE_NAME}:${IMAGE_TAG}"
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" "$REPO_ROOT"
echo "Build complete: ${IMAGE_NAME}:${IMAGE_TAG}"
```

**Step 2: Make it executable**

Run: `chmod +x scripts/build-worker.sh`

---

### Task 4: Add pnpm docker:build script

**Files:**
- Modify: `package.json`

**Step 1: Add docker:build script to package.json**

Add to the `"scripts"` object:

```json
"docker:build": "bash scripts/build-worker.sh"
```

This lets developers run `pnpm docker:build` instead of remembering the script path.

---

### Task 5: Build the image and verify it works

**Step 1: Build the image**

Run: `pnpm docker:build`
Expected: Image builds successfully, prints "Build complete: qbadger-worker:latest"

**Step 2: Verify tools are installed**

Run: `docker run --rm qbadger-worker:latest node --version`
Expected: `v22.x.x`

Run: `docker run --rm qbadger-worker:latest git --version`
Expected: `git version 2.x.x`

Run: `docker run --rm qbadger-worker:latest gh --version`
Expected: `gh version x.x.x`

Run: `docker run --rm qbadger-worker:latest pnpm --version`
Expected: `10.x.x`

Run: `docker run --rm qbadger-worker:latest claude --version`
Expected: version string (confirms CLI installed)

**Step 3: Verify non-root user**

Run: `docker run --rm qbadger-worker:latest whoami`
Expected: `worker`

Run: `docker run --rm qbadger-worker:latest id`
Expected: `uid=1000(worker)` (not root)

---

### Task 6: Write integration test for worker image

**Files:**
- Create: `test/worker-image.integration.test.ts`

**Step 1: Write the test**

```typescript
import { describe, it, expect } from "vitest";
import { ContainerRunner } from "../src/container-runner.js";
import Dockerode from "dockerode";

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === "true";
const WORKER_IMAGE = "qbadger-worker:latest";

describe.skipIf(!RUN_INTEGRATION)("worker image integration", () => {
  const docker = new Dockerode();
  const runner = new ContainerRunner(docker);

  it("has node 22 installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["node", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/v22\./);
  }, 30_000);

  it("has git installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["git", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/git version/);
  }, 30_000);

  it("has gh CLI installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["gh", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/gh version/);
  }, 30_000);

  it("has pnpm installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["pnpm", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/10\./);
  }, 30_000);

  it("has claude CLI installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["claude", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/\d+\.\d+/);
  }, 30_000);

  it("runs as non-root user", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["whoami"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/worker/);
  }, 30_000);
});
```

**Step 2: Run integration test**

Run: `RUN_INTEGRATION_TESTS=true pnpm test -- test/worker-image.integration.test.ts`
Expected: All 6 tests pass

---

### Task 7: Run full check suite

**Step 1: Run pnpm check**

Run: `pnpm check`
Expected: build, lint:types, lint, and test all pass (integration test is skipped without env flag)

---

### Task 8: Commit

**Step 1: Stage and commit all changes**

```bash
git add Dockerfile .dockerignore scripts/build-worker.sh package.json test/worker-image.integration.test.ts
git commit -m "feat: add worker container image with Dockerfile and build tooling (#16)

- Dockerfile: Node.js 22-slim, git, gh CLI, pnpm 10, Claude Code CLI
- Non-root worker user for container security
- Build script at scripts/build-worker.sh (also pnpm docker:build)
- .dockerignore to keep build context small
- Integration test verifying all tools installed and non-root execution"
```
