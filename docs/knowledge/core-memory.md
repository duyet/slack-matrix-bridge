# Core Maintenance Memory

Last updated: 2026-05-18

## Automation Loop

Use this loop for routine code-smell and dead-code passes:

1. Scope recent changes (prefer since last run, fallback 7 days):

```bash
git log --since="<ISO-8601 timestamp>" --name-only --pretty=format:'%h %ad %s' --date=iso
# Fallback when no saved timestamp is available
git log --since="7 days ago" --name-only --pretty=format:'%h %ad %s' --date=iso
```

1. Prepare writable Bun temp/cache dirs for sandboxed runs:

```bash
mkdir -p .bun-tmp .bun-cache
export BUN_TMPDIR="$PWD/.bun-tmp"
export BUN_INSTALL_CACHE_DIR="$PWD/.bun-cache"
```

1. Install dependencies in fresh worktrees:

```bash
bun install
```

1. Prove dead code candidates with zero non-test references:

```bash
rg -n "<symbol_name>" src --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/__tests__/**' --glob '!tests/**'
```

1. Verify before PR:

```bash
bun audit
XDG_CONFIG_HOME=$PWD/.tmp/xdg WRANGLER_HOME=$PWD/.tmp/wrangler TMPDIR=$PWD/.tmp bun run test:run
bun run typecheck
```

1. Open and babysit PR:

```bash
gh pr create --fill
gh pr comment --body "@codex review"
gh pr checks --watch

# 5) Verify merge commit CI on main
gh run list --branch main --commit "<merge_sha>" --json databaseId,name,status,conclusion,url

# 6) Inspect failed workflow logs in sandbox-safe path
XDG_CACHE_HOME=$PWD/.tmp/gh-cache gh run view "<run_id>" --log-failed
```

## Durable Rules

- Keep findings evidence-based (SHA, path, line, command output).
- Prefer minimal safe fixes over refactors.
- Do not create dated review documents (for example `code-smell-dead-code-YYYY-MM-DD.md`).
- Update this file for recurring knowledge instead.
- Keep `vitest` scoped to repo tests (exclude local cache/temp directories like `.bun-cache` and `.bun-tmp`).
- If a PR edits `.github/workflows/claude*.yml`, `Claude Code Review` may fail
  with `Workflow validation failed` until default-branch workflow content
  matches. Treat that as workflow sync behavior, not app-code regression.
