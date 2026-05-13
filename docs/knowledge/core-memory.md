# Core Maintenance Memory

Last updated: 2026-05-13

## Automation Loop

Use this loop for routine code-smell and dead-code passes:

1. Scope recent changes (prefer since last run, fallback 7 days):

```bash
git log --since="<ISO-8601 timestamp>" --name-only --pretty=format:'%h %ad %s' --date=iso
# Fallback when no saved timestamp is available
git log --since="24 hours ago" --name-only --pretty=format:'%h %ad %s' --date=iso
```

1. Prove dead code candidates with zero non-test references:

```bash
rg -n "<symbol_name>" src --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/__tests__/**' --glob '!tests/**'
```

1. Verify before PR:

```bash
bun audit
bun run test:run
bun run typecheck
```

1. Open and babysit PR:

```bash
gh pr create --fill
gh pr comment --body "@codex review"
gh pr checks --watch
```

## Durable Rules

- Keep findings evidence-based (SHA, path, line, command output).
- Prefer minimal safe fixes over refactors.
- Do not create dated review documents (for example `code-smell-dead-code-YYYY-MM-DD.md`).
- Update this file for recurring knowledge instead.
- If Bun tempdir writes fail in sandboxed environments, run Bun commands with a workspace-local `TMPDIR` and a cache directory outside the repo (for example `/private/tmp/bun-cache`) so Vitest does not discover cached `*.test.*` files.
