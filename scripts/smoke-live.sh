#!/usr/bin/env bash
# Live smoke: POST Bugsink-shaped Slack payloads at a bridge URL.
# Does not mock Hookshot — the destination encoded in the path receives real messages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE="${SMOKE_EVIDENCE_DIR:-$ROOT/.tmp/verify-evidence}"
mkdir -p "$EVIDENCE"

BRIDGE_URL="${SMOKE_BRIDGE_URL:-}"
if [[ -z "$BRIDGE_URL" ]]; then
  echo "Set SMOKE_BRIDGE_URL to the full bridge webhook URL (worker + Base64 path)." >&2
  exit 2
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
log="$EVIDENCE/smoke-live-$stamp.txt"

post() {
  local name="$1"
  local json="$2"
  local body
  local code
  body="$(mktemp)"
  code="$(curl -sS -o "$body" -w '%{http_code}' -X POST "$BRIDGE_URL" \
    -H 'Content-Type: application/json' \
    --data "$json")"
  echo "$name HTTP $code" | tee -a "$log"
  cat "$body" | tee -a "$log"
  echo >> "$log"
  if [[ "$code" != "200" ]]; then
    echo "FAIL $name: expected 200 ok" >&2
    rm -f "$body"
    exit 1
  fi
  if [[ "$(cat "$body")" != "ok" ]]; then
    echo "FAIL $name: expected body ok" >&2
    rm -f "$body"
    exit 1
  fi
  rm -f "$body"
}

home_code="$(curl -sS -o /dev/null -w '%{http_code}' "${SMOKE_HOME_URL:-https://slack-matrix-bridge.duyet.workers.dev/}")"
echo "GET / HTTP $home_code" | tee "$log"
if [[ "$home_code" != "200" ]]; then
  echo "FAIL home page" >&2
  exit 1
fi

post "bugsink-test" '{"text":"TEST issue","blocks":[{"type":"header","text":{"type":"plain_text","text":"TEST issue"}},{"type":"section","text":{"type":"mrkdwn","text":"Smoke test by slack-matrix-bridge."}},{"type":"section","fields":[{"type":"mrkdwn","text":"*project*: dev-api"},{"type":"mrkdwn","text":"*message backend*: smoke-live"}]}]}'

post "bugsink-alert" '{"text":"TypeError: smoke test","username":"Bugsink","blocks":[{"type":"header","text":{"type":"plain_text","text":"TypeError: smoke test"}},{"type":"section","text":{"type":"plain_text","text":"NEW issue"}},{"type":"section","fields":[{"type":"mrkdwn","text":"*project*: dev-api"},{"type":"mrkdwn","text":"*environment*: production"},{"type":"mrkdwn","text":"*server*: api-1"}]},{"type":"section","text":{"type":"mrkdwn","text":"<https://example.com/issues/smoke|view on Bugsink>"}}]}'

echo "PASS evidence=$log"
