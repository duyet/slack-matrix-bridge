# URL generator

Home page encodes a Matrix Hookshot URL into a bridge webhook path.

## Sub-features

- `home-renders` — GET `/` returns the generator HTML.
- `encode-path` — pasted `https://…` becomes Base64 in the displayed bridge URL.

## How to get to it (user POV)

- Open `https://slack-matrix-bridge.duyet.workers.dev/` or `http://127.0.0.1:8787/`.

## Driving it with curl / browser

Preconditions: origin returns 200.

- GET `/` — status 200, body contains `Slack-Matrix Bridge` and `Generate Bridge URL`.
- Type a Hookshot URL into `input[type=url]`, click Generate — result path decodes with `atob` (URL-safe) to the same URL.
- Enter key on the input also generates.

## Gotchas

- Path uses URL-safe Base64 (`-` `_`, padding often stripped).
- GET on a webhook path is 404; only POST is the webhook.
