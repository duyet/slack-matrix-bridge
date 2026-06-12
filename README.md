# Slack-Matrix Bridge

A stateless Slack-to-Matrix webhook bridge hosted on Cloudflare Workers. One-shot build by Claude Code.

## Live Demo

**https://slack-matrix-bridge.duyet.workers.dev**

## Features

- **Zero Configuration**: No database or server-side config needed
- **Full Slack Compatibility**: Supports Block Kit and legacy attachments
- **Mrkdwn Translation**: Converts Slack markup to Matrix HTML
- **Serverless**: Hosted on Cloudflare Workers (0ms cold starts)
- **Privacy-First**: No data persistence
- **Web UI**: Built-in URL generator

## Architecture

**State-in-URL Pattern**: The destination Matrix URL is Base64-encoded in the request path.

```
https://bridge.workers.dev/<BASE64_ENCODED_HOOKSHOT_URL>
```

**Request Flow:**
```
Slack Service → Bridge URL → Cloudflare Worker
                                    ↓
                              Decode Matrix URL
                                    ↓
                              Transform Payload
                                    ↓
                              Forward to Hookshot
                                    ↓
                              Return "ok"
```

## Quick Start

### 1. Create a Matrix Webhook

Invite the **Hookshot** bot to your Matrix room and send:
```
!hookshot webhook create Bridge
```

Copy the URL (e.g., `https://hookshot.example.com/webhooks/v2/abcdef123456`)

### 2. Generate Your Bridge URL

1. Open the live demo or deploy your own
2. Paste your Matrix Hookshot URL
3. Click "Generate Bridge URL"
4. Copy the generated Bridge URL

### 3. Configure Your Service

Paste the Bridge URL into any Slack-compatible webhook service:
- GitHub, GitLab, Jenkins, Grafana, etc.

## Usage Examples

### Simple Text
```bash
curl -X POST https://your-worker.workers.dev/BASE64_STRING \
  -H "Content-Type: application/json" \
  -d '{"text": "Deployment successful!"}'
```

### Block Kit
```bash
curl -X POST https://your-worker.workers.dev/BASE64_STRING \
  -H "Content-Type: application/json" \
  -d '{
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Build* #1234 completed\nStatus: <https://example.com|Success>"
        }
      }
    ]
  }'
```

### Legacy Attachment
```bash
curl -X POST https://your-worker.workers.dev/BASE64_STRING \
  -H "Content-Type: application/json" \
  -d '{
    "attachments": [
      {
        "color": "good",
        "title": "Deployment",
        "text": "Successfully deployed to production",
        "fields": [
          {"title": "Environment", "value": "Production"},
          {"title": "Duration", "value": "2m 34s"}
        ]
      }
    ]
  }'
```

### Debug Metadata Mode (Optional)

By default, forwarded messages include only safe metadata (for example, timestamp/source msgtype) and do **not** include internal Matrix identifiers (`event_id`, `room_id`, `sender`).

If you need forensic context temporarily, you can enable debug metadata on a per-request basis:

```bash
curl -X POST https://your-worker.workers.dev/BASE64_STRING \
  -H "Content-Type: application/json" \
  -d '{
    "enableDebugMetadata": true,
    "content": {
      "body": "<https://example.com/issues/123|Issue Link>",
      "msgtype": "m.notice"
    },
    "event_id": "$event123",
    "room_id": "!room:example.com",
    "sender": "@bot:example.com",
    "origin_server_ts": 1714564800000
  }'
```

## Deployment

```bash
# Clone the repository
git clone https://github.com/duyet/slack-matrix-bridge.git
cd slack-matrix-bridge

# Install dependencies
pnpm install

# Login to Cloudflare
pnpm exec wrangler login

# Deploy
pnpm run deploy
```

## License

MIT
