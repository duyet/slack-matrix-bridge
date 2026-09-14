# Bugsink Slack format

Bugsink sends Slack Block Kit. The bridge must keep title, project, env, server, and backend. Hide `view on Bugsink` links (wrong dest for Matrix readers).

## Sub-features

- `test-message` — header `TEST issue`, fields `project` and `message backend`.
- `alert-message` — header = issue title, `NEW issue`, `project`, optional env/server. No `view on Bugsink` link.
- `no-debug-dump` — body must not append `Debug metadata`.

## How to get to it (user POV)

- Bugsink project megaphone → webhook URL = bridge URL → Test button, or wait for a real issue.

## Driving it with vitest

Preconditions: fixtures in `src/smoke.test.ts`.

- `pnpm exec vitest run src/smoke.test.ts`
- Assert `html` has `<h3>…</h3>`, `<strong>project:</strong>`.
- Assert no `##` heading leftovers in `html`.
- Assert no `view on Bugsink` text or href.

Upstream payload shape: Bugsink `alerts/service_backends/slack.py` (`header`, `section` fields `*project*: name`, `<url|view on Bugsink>`). Drop that last link. Environment/server are not always sent by Bugsink; keep them when present.

## Gotchas

- Block Kit fields are `{type,text}` not `{title,value}`.
- `*project*: value` and `*project:*\nvalue` both occur.
- Username may be absent; Hookshot then uses the webhook display name.
