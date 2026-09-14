# slack-matrix-bridge verification map

Read this index, then the matching feature file.

## Baseline

- `pnpm install`
- Tests: `XDG_CONFIG_HOME=$PWD/.tmp/xdg WRANGLER_HOME=$PWD/.tmp/wrangler TMPDIR=$PWD/.tmp pnpm run test:run`
- Local worker on `8787` only if driving HTTP/UI.
- Never POST to a production Hookshot URL unless the user asked for a live smoke.

## Features

- [URL generator](./url-generator.md)
- [Webhook forward](./webhook-forward.md)
- [Bugsink Slack format](./bugsink-slack.md)
