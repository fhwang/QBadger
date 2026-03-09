# QBadger

## Repository Structure

This repo uses git worktrees for parallel development. The main branch checkout lives in a `main/` directory, with worktrees as sibling directories:

```
<project-root>/
├── main/                    ← main branch checkout
├── 42-auth-system/          ← worktree for issue #42
└── ...
```

## Worktree Conventions

- Branches are named `<issue-number>-<short-description>`, based on GitHub issues
- Worktree directories match branch names and live as siblings to `main/`
- Each worktree gets its own Claude Code session

### Creating a worktree

From the `main/` directory, always fetch from origin first to ensure you're branching off the latest main:

```bash
git fetch origin
git worktree add ../<issue-number>-<short-description> -b <issue-number>-<short-description> origin/main
```

### Removing a worktree

From the `main/` directory:

```bash
git worktree remove ../<branch-name>
```

## Project Conventions

- **Language:** TypeScript
- **Runtime:** Node.js 22 (see `.nvmrc`). Node is already on the PATH — do not prefix commands with `source ~/.nvm/nvm.sh && nvm use`.
- **Package manager:** pnpm
- **Build:** `pnpm build` (tsc)
- **Test:** `pnpm test` (vitest)
- **Lint:** `pnpm lint` (eslint, no Prettier)
- **Dev:** `pnpm dev` (tsx watch)

### Directory Structure

- `src/` — application source
- `test/` — test files (`*.test.ts`)
- `scripts/` — build/deploy scripts
- `docs/` — documentation and plans
