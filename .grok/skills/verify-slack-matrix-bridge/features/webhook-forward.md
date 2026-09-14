# Webhook forward

POST Slack JSON to `/<base64 dest>`; worker transforms and POSTs to Hookshot; replies `ok`.

## Sub-features

- `fake-slack-ok` — 200 body `ok` when Hookshot is 2xx.
- `html-payload` — forwarded JSON includes `text`, `html`, `formatted_body`.
- `ssrf` — non-http dest in the path is 400.

## How to get to it (user POV)

- Slack-compatible sender (Bugsink, Grafana, GitHub) POSTs to the generated bridge URL.

## Driving it with vitest / curl

Preconditions: dest is http(s). Prefer mock fetch via `src/smoke.test.ts` / `src/index.test.ts`.

- POST valid Slack JSON — 200 `ok`, captured fetch body has `html`.
- POST invalid JSON — 400.
- POST `/` with no encoded dest — 400 missing destination.
- Live: `SMOKE_BRIDGE_URL=… ./scripts/smoke-live.sh`.

## Gotchas

- Hookshot reads `html`, not only Matrix `formatted_body`. Both must be set and equal.
- Live smoke delivers real room messages.
