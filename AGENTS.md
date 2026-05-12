# Slack-Matrix Bridge Agent Notes

Canonical repo guidance lives in [`CLAUDE.md`](./CLAUDE.md). Keep these two files in sync when workflow commands change.

## Automation Workflow Commands

```bash
# 1) Find commit scope since last automation run (or last 24h fallback)
git log --since="<ISO-8601 timestamp>" --name-only --pretty=format:'%h %ad %s' --date=iso

# 2) Prove dead code with zero references (exclude tests)
rg -n "<symbol_name>" src --glob '!**/*.test.ts' --glob '!tests/**'

# 3) Verify before PR
bun run test:run
bun run typecheck

# 4) PR + review loop
gh pr create --fill
gh pr comment --body "@codex review"
gh pr checks --watch
```
