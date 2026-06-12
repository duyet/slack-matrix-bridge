# Core Maintenance Memory

Last updated: 2026-05-19

## Automation Loop

Use this loop for routine code-smell and dead-code passes:

1. Scope recent changes (prefer since last run, fallback 7 days):

```bash
git log --since="<ISO-8601 timestamp>" --name-only --pretty=format:'%h %ad %s' --date=iso
git log --since="<ISO-8601 timestamp>" --no-merges --name-only --pretty=format:'%h %ad %s' --date=iso
# Fallback when no saved timestamp is available
git log --since="7 days ago" --name-only --pretty=format:'%h %ad %s' --date=iso
git log --since="7 days ago" --no-merges --name-only --pretty=format:'%h %ad %s' --date=iso
```

1. Install dependencies in fresh worktrees:

```bash
pnpm install
```

1. Prove dead code candidates with zero non-test references:

```bash
rg -n "<symbol_name>" src --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/__tests__/**' --glob '!tests/**'
```

1. Verify before PR:

```bash
pnpm audit
XDG_CONFIG_HOME=$PWD/.tmp/xdg WRANGLER_HOME=$PWD/.tmp/wrangler TMPDIR=$PWD/.tmp pnpm run test:run
pnpm run typecheck
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
- Keep `vitest` scoped to repo tests.
- If commit scope since last run is empty, report a no-op run and use the 7-day window for context-only review.
- If `pnpm audit` reports GHSA-58qx-3vcg-4xpx (`ws`), pin `overrides.ws` to a patched release and re-run checks.
- If a PR edits `.github/workflows/claude*.yml`, `Claude Code Review` may fail
  with `Workflow validation failed` until default-branch workflow content
  matches. Treat that as workflow sync behavior, not app-code regression.
