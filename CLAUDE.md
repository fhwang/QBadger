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

From the `main/` directory:

```bash
git worktree add ../<issue-number>-<short-description> -b <issue-number>-<short-description>
```

### Removing a worktree

From the `main/` directory:

```bash
git worktree remove ../<branch-name>
```
