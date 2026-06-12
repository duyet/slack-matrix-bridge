# Slack-Matrix Bridge Agent Notes

Canonical repo guidance lives in [`CLAUDE.md`](./CLAUDE.md). Keep these two files in sync when workflow commands change.
Maintenance memory lives in [`docs/knowledge/core-memory.md`](./docs/knowledge/core-memory.md) and is indexed from [`docs/INDEX.md`](./docs/INDEX.md).

## Automation Workflow Commands

```bash
# 1) Install dependencies in fresh worktrees
pnpm install

# 2) Find commit scope since last automation run (or last 7 days fallback)
git log --since="<ISO-8601 timestamp>" --name-only --pretty=format:'%h %ad %s' --date=iso
git log --since="<ISO-8601 timestamp>" --no-merges --name-only --pretty=format:'%h %ad %s' --date=iso
# Fallback when no saved timestamp is available
git log --since="7 days ago" --name-only --pretty=format:'%h %ad %s' --date=iso
git log --since="7 days ago" --no-merges --name-only --pretty=format:'%h %ad %s' --date=iso

# 3) Prove dead code with zero references (exclude tests)
rg -n "<symbol_name>" src --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/__tests__/**' --glob '!tests/**'

# 4) Verify before PR
pnpm audit
XDG_CONFIG_HOME=$PWD/.tmp/xdg WRANGLER_HOME=$PWD/.tmp/wrangler TMPDIR=$PWD/.tmp pnpm run test:run
pnpm run typecheck

# 5) PR + review loop
gh pr create --fill
gh pr comment --body "@codex review"
gh pr checks --watch

# 6) Verify merge commit CI on main
gh run list --branch main --commit "<merge_sha>" --json databaseId,name,status,conclusion,url

# 7) Inspect failed workflow logs in sandbox-safe path
XDG_CACHE_HOME=$PWD/.tmp/gh-cache gh run view "<run_id>" --log-failed
```
