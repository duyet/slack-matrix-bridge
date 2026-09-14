---
name: research-bridge-payloads
description: Research Slack, Bugsink, and Matrix Hookshot webhook payload shapes before changing the transpiler. Use when a conversion looks wrong, a new sender is added, or the user asks to research format/fields. /research-bridge-payloads
---

# Research bridge payloads

Do not guess field names. Pull current sender docs and a real sample, then map each field to Matrix/Hookshot output.

## When

- New alert source (Bugsink, Grafana, GitHub, PagerDuty, …)
- Missing project/env/server/source in Matrix
- Hookshot rendering looks like raw markdown

## Sources (in order)

1. A captured JSON body (user paste, `wrangler tail`, or test fixture in `src/smoke.test.ts`).
2. Sender source:
   - Bugsink: `https://raw.githubusercontent.com/bugsink/bugsink/master/alerts/service_backends/slack.py`
   - Slack attachments/blocks: Slack API message attachments + Block Kit section/header/fields
   - Hookshot generic webhook: `https://github.com/matrix-org/matrix-hookshot/blob/main/docs/setup/webhooks.md` — `text` + optional `html` + `username`
3. This repo: `src/transpiler.ts` types `SlackPayload` / `SlackBlock` / `SlackAttachment` and `MatrixPayload`.

## Method

1. Write the inbound JSON (redact tokens).
2. Table: Slack path → current Matrix `text`/`html` → desired.
3. Note fields the sender never sends (Bugsink alert currently has `project` only; `environment` is a TODO upstream).
4. If Hookshot docs disagree with our payload keys, treat Hookshot as the dest contract (`html`, not only `formatted_body`).
5. Add or extend a fixture in `src/smoke.test.ts` before changing the transpiler.

## Output

- Inbound sample (trimmed)
- Field map
- Gaps (dropped fields, wrong key for dest)
- Proposed fixture name and assertions (`<h3>`, labeled fields, `external_url`, no `Debug metadata`)
