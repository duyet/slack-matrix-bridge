---
name: verify-slack-matrix-bridge
description: Drive and prove the Slack-Matrix bridge (URL generator + webhook POST). Use when verifying conversions, smoke-testing Bugsink Slack payloads, checking Hookshot html, or running /verify-slack-matrix-bridge.
---

# Verify slack-matrix-bridge

Stateless Cloudflare Worker. Users hit `GET /` (URL generator) or `POST /<base64-hookshot-url>` (Slack JSON in, Matrix/Hookshot JSON out).

## Launch

Local:

```bash
XDG_CONFIG_HOME=$PWD/.tmp/xdg WRANGLER_HOME=$PWD/.tmp/wrangler TMPDIR=$PWD/.tmp pnpm run dev
```

Ready when port `8787` answers. Production: `https://slack-matrix-bridge.duyet.workers.dev`.

Teardown: stop the wrangler process you started. Do not kill by name.

## Doctor

```bash
pnpm install
XDG_CONFIG_HOME=$PWD/.tmp/xdg WRANGLER_HOME=$PWD/.tmp/wrangler TMPDIR=$PWD/.tmp pnpm run test:run
pnpm run typecheck
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/   # or production origin
```

Doctor fails if tests fail or GET `/` is not 200.

## Drive

Prefer the Vitest smoke (no live Matrix):

```bash
pnpm exec vitest run src/smoke.test.ts
```

Live Hookshot (posts real Matrix messages):

```bash
chmod +x scripts/smoke-live.sh
SMOKE_BRIDGE_URL='https://slack-matrix-bridge.duyet.workers.dev/<BASE64>' ./scripts/smoke-live.sh
```

HTTP against local worker:

```bash
ENCODED="$(python3 -c 'import base64; print(base64.urlsafe_b64encode(b"https://example.com/webhook").decode().rstrip("="))')"
curl -sS -D - -X POST "http://127.0.0.1:8787/$ENCODED" -H 'Content-Type: application/json' -d '{"text":"hi"}'
```

UI: open `GET /`, paste a Hookshot URL, generate, copy the bridge URL. Selectors are the page's `input[type=url]` and the Generate button.

## Evidence

Write under `.tmp/verify-evidence/` (survives cleanup).

Proof bar:

- Unit/smoke: `src/smoke.test.ts` pass. Forwarded JSON has `html` == `formatted_body`, `<h3>` for headers, labeled `project`/`environment`/`server` when present, no `Debug metadata`.
- Live: script prints `PASS` and HTTP 200 `ok`. Confirm the Matrix room if the encoded dest is real.
- UI: generated path is Base64 of the pasted Hookshot URL.

## Cleanup

Stop wrangler you launched. Keep `.tmp/verify-evidence/`.

## Helpers

- `src/smoke.test.ts` — Bugsink fixtures through transpiler + worker.
- `scripts/smoke-live.sh` — live POST.

Feature recipes: `features/README.md`.
