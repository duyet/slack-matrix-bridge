# Slack-Matrix Bridge

A stateless Slack-to-Matrix webhook bridge hosted on Cloudflare Workers. Seamlessly connect legacy Slack integrations to Matrix rooms without servers, databases, or configuration.

## Features

- **Zero Configuration**: State-in-URL architecture means no database or server-side config
- **Full Slack Compatibility**: Supports both modern Block Kit and legacy attachment formats
- **Mrkdwn Translation**: Converts Slack's proprietary markup to Matrix-compatible HTML
- **Serverless**: Hosted on Cloudflare Workers with 0ms cold starts
- **Privacy-First**: No data persistence, all processing happens in-memory
- **Web UI**: Built-in URL generator for easy bridge URL creation

## Quick Start

### 1. Create a Matrix Webhook

1. Invite the **Hookshot** bot to your Matrix room
2. Send: `!hookshot webhook create Bridge`
3. Copy the URL (e.g., `https://hookshot.example.com/webhooks/v2/abcdef123456`)

### 2. Generate Your Bridge URL

1. Deploy this worker (see [Deployment](#deployment))
2. Open your worker URL in a browser
3. Paste your Matrix Hookshot URL
4. Click "Generate Bridge URL"
5. Copy the generated Bridge URL

### 3. Configure Your Service

Paste the Bridge URL into any service that supports Slack webhooks:

- GitHub: Repository Settings → Webhooks → Slack
- GitLab: Project Settings → Integrations → Slack
- Jenkins: Post-build Actions → Slack Notifications
- Grafana: Alerting → Notification channels → Slack
- Any Slack-compatible webhook service

## Deployment

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI

### Install and Deploy

```bash
# Clone the repository
git clone https://github.com/yourusername/slack-matrix-bridge.git
cd slack-matrix-bridge

# Install dependencies
npm install

# Login to Cloudflare (first time only)
npx wrangler login

# Deploy
npm run deploy
```

Wrangler will output your worker URL:
```
Published slack-matrix-bridge
   https://slack-matrix-bridge.yourname.workers.dev
```

### Manual URL Generation

If you prefer not to use the web UI:

```javascript
// In browser console
const hookshotUrl = "https://hookshot.example.com/webhooks/v2/abcdef123456";
const base64 = btoa(hookshotUrl)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
const bridgeUrl = `https://your-worker.workers.dev/${base64}`;
console.log(bridgeUrl);
```

## Usage Examples

### Simple Text Message

Send to your Bridge URL:
```json
{
  "text": "Deployment successful!"
}
```

### Block Kit Message

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Build* #1234 completed\nStatus: <https://example.com|Success>"
      }
    }
  ]
}
```

### Legacy Attachment

```json
{
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
}
```

## Architecture

### State-in-URL Pattern

Traditional bridges require a database to map incoming webhooks to destinations. This bridge encodes the destination directly in the URL:

```
https://bridge.workers.dev/<BASE64_ENCODED_HOOKSHOT_URL>
```

**Advantages:**
- No database costs
- Infinite scalability
- Zero configuration
- Privacy by design

### Request Flow

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

## Format Translation

### Mrkdwn to HTML

| Slack Mrkdwn | Matrix HTML |
|-------------|-------------|
| `*bold*` | `<b>bold</b>` |
| `_italic_` | `<i>italic</i>` |
| `~strike~` | `<s>strike</s>` |
| `` `code` `` | `<code>code</code>` |
| `<https://example.com|Link>` | `<a href="https://example.com">Link</a>` |

### Color Mapping

Slack attachment colors map to emoji indicators:

- `danger` / red → 🔴
- `warning` / yellow → ⚠️
- `good` / green → 🟢
- other → 🔵

## Troubleshooting

### Error Codes

| Code | Message | Solution |
|------|---------|----------|
| 400 | Missing destination URL | Ensure Base64 string is appended to worker URL |
| 400 | Invalid Base64 encoded... | Re-encode the Matrix URL, check for typos |
| 400 | invalid_payload | Check that source sends valid JSON |
| 404 | Upstream Matrix Error | Verify Hookshot webhook exists and bot is in room |
| 502 | Bridge Error | Check Hookshot server availability |

### Testing

```bash
# Test your bridge with curl
curl -X POST https://your-worker.workers.dev/BASE64_STRING \
  -H "Content-Type: application/json" \
  -d '{"text": "Test message"}'

# Should return: ok
```

### Debugging

View real-time logs:

```bash
npm run tail
```

## Security

- **URL Secrecy**: The Bridge URL is a capability URL - anyone with it can send messages
- **No Encryption**: Base64 is encoding, not encryption. Treat the entire URL as secret
- **SSRF Protection**: Only http/https protocols allowed
- **No Data Retention**: All processing is ephemeral, nothing is logged or stored

If your Bridge URL is compromised:
1. Revoke the webhook in Matrix (`!hookshot webhook delete`)
2. Create a new webhook
3. Generate a new Bridge URL

## Development

```bash
# Run local development server
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Run tests with coverage
npm run test:coverage
```

## License

MIT

## Links

- [Live Demo](https://slack-matrix-bridge.workers.dev) (Replace with your deployed URL)
- [Cloudflare Workers](https://workers.cloudflare.com)
- [Matrix Hookshot](https://github.com/matrix-org/matrix-hookshot)
- [Slack API Docs](https://api.slack.com/messaging/webhooks)
