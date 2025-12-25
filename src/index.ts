/**
 * Stateless Slack-to-Matrix Bridge
 *
 * Routes Slack webhooks to Matrix Hookshot based on a Base64-encoded URL in the path.
 * Performs real-time translation of Slack Block Kit and Mrkdwn to Matrix HTML.
 *
 * Architecture: "State-in-URL" pattern - destination URL is encoded in the request path
 * Runtime: Cloudflare Workers (V8 Isolates)
 * Framework: Hono for clean routing and request handling
 */

import { Hono } from 'hono';
import { transformSlackToMatrix, decodeMatrixUrl, isValidBase64Url, type SlackPayload } from './transpiler';

// Environment types for Cloudflare Workers (empty for stateless implementation)
type Env = {
  Bindings: Record<string, never>;
  Variables: Record<string, never>;
};

const app = new Hono<Env>();

// ============================================================================
// Web UI - URL Generator Form
// ============================================================================

const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slack-Matrix Bridge URL Generator</title>
  <style>
    :root {
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --primary-light: #eef2ff;
      --bg-gradient-start: #f8fafc;
      --bg-gradient-end: #f1f5f9;
      --card-bg: #ffffff;
      --text-primary: #0f172a;
      --text-secondary: #64748b;
      --text-muted: #94a3b8;
      --border: #e2e8f0;
      --success: #10b981;
      --success-light: #d1fae5;
      --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
      --radius: 12px;
      --radius-sm: 8px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, var(--bg-gradient-start), var(--bg-gradient-end));
      min-height: 100vh;
      color: var(--text-primary);
      line-height: 1.6;
      padding: 20px;
    }

    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }

    .header { text-align: center; margin-bottom: 48px; }

    .logo {
      width: 64px; height: 64px; margin: 0 auto 20px;
      background: linear-gradient(135deg, var(--primary), var(--primary-hover));
      border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: var(--shadow-lg);
    }

    .logo svg { width: 36px; height: 36px; color: white; }

    h1 {
      font-size: 2.5rem; font-weight: 700; margin-bottom: 12px;
      background: linear-gradient(135deg, var(--primary), var(--primary-hover));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }

    .subtitle { color: var(--text-secondary); font-size: 1.125rem; }

    .card {
      background: var(--card-bg); border-radius: var(--radius);
      box-shadow: var(--shadow); padding: 32px; margin-bottom: 24px;
      border: 1px solid var(--border);
    }

    label {
      display: block; font-weight: 600; font-size: 0.9375rem;
      color: var(--text-primary); margin-bottom: 8px;
    }

    input[type="url"] {
      width: 100%; padding: 14px 16px; font-size: 1rem;
      border: 2px solid var(--border); border-radius: var(--radius-sm);
      outline: none; background: var(--card-bg); color: var(--text-primary);
    }

    input[type="url"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-light);
    }

    input[type="url"]::placeholder { color: var(--text-muted); }

    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 8px; padding: 14px 28px; font-size: 1rem; font-weight: 600;
      border: none; border-radius: var(--radius-sm); cursor: pointer;
      transition: all 0.2s ease; width: 100%;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary), var(--primary-hover));
      color: white; box-shadow: var(--shadow);
    }

    .btn-primary:hover { transform: translateY(-1px); box-shadow: var(--shadow-lg); }

    .btn-primary:active { transform: translateY(0); }

    .btn-copy {
      background: var(--primary-light); color: var(--primary);
      padding: 10px 20px; font-size: 0.875rem; width: auto;
    }

    .btn-copy:hover { background: var(--primary); color: white; }

    .btn-copy.copied { background: var(--success); color: white; }

    .results { display: none; animation: slideDown 0.3s ease; }
    .results.visible { display: block; }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .result-item { margin-bottom: 24px; }
    .result-item:last-child { margin-bottom: 0; }

    .result-label {
      font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary);
      text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;
    }

    .result-box {
      background: var(--bg-gradient-start); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 16px;
      font-family: 'Monaco', 'Menlo', monospace; font-size: 0.875rem;
      color: var(--text-primary); word-break: break-all; line-height: 1.6;
    }

    .result-box.highlight { background: var(--success-light); border-color: var(--success); }

    .copy-btn-wrapper { display: flex; gap: 12px; margin-top: 12px; }

    .divider { height: 1px; background: var(--border); margin: 32px 0; }

    .error {
      display: none; background: #fee2e2; border: 1px solid #fecaca;
      color: #991b1b; padding: 12px 16px; border-radius: var(--radius-sm);
      margin-bottom: 20px; font-size: 0.9375rem;
    }

    .error.visible { display: block; animation: shake 0.4s ease; }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }

    .footer { text-align: center; margin-top: 48px; color: var(--text-muted); font-size: 0.875rem; }
    .footer a { color: var(--primary); text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <h1>Slack-Matrix Bridge</h1>
      <p class="subtitle">Generate your Bridge URL in seconds</p>
    </div>

    <div class="card">
      <div id="error" class="error"></div>

      <div style="margin-bottom: 24px;">
        <label for="hookshotUrl">Matrix Hookshot URL</label>
        <input
          type="url"
          id="hookshotUrl"
          placeholder="https://hookshot.example.com/webhooks/v2/abcdef123456"
          required
        />
      </div>

      <button class="btn btn-primary" id="generateBtn">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Generate Bridge URL
      </button>
    </div>

    <div id="results" class="results">
      <div class="card">
        <div class="result-item">
          <div class="result-label">Original Hookshot URL</div>
          <div class="result-box" id="originalUrl"></div>
        </div>

        <div class="divider"></div>

        <div class="result-item">
          <div class="result-label">Base64 Encoded</div>
          <div class="result-box" id="base64Url"></div>
          <div class="copy-btn-wrapper">
            <button class="btn btn-copy" onclick="copyToClipboard('base64Url', this)">Copy Base64</button>
          </div>
        </div>

        <div class="divider"></div>

        <div class="result-item">
          <div class="result-label">Final Bridge URL (Use This)</div>
          <div class="result-box highlight" id="bridgeUrl"></div>
          <div class="copy-btn-wrapper">
            <button class="btn btn-copy" onclick="copyToClipboard('bridgeUrl', this)">Copy Bridge URL</button>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Powered by <a href="https://workers.cloudflare.com" target="_blank" rel="noopener">Cloudflare Workers</a> &bull; <a href="https://matrix.org" target="_blank" rel="noopener">Matrix</a></p>
    </div>

    <script>
      const hookshotInput = document.getElementById('hookshotUrl');
      const generateBtn = document.getElementById('generateBtn');
      const resultsDiv = document.getElementById('results');
      const errorDiv = document.getElementById('error');
      const originalUrlEl = document.getElementById('originalUrl');
      const base64UrlEl = document.getElementById('base64Url');
      const bridgeUrlEl = document.getElementById('bridgeUrl');

      function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.add('visible');
        setTimeout(() => errorDiv.classList.remove('visible'), 5000);
      }

      function encodeBase64Url(url) {
        const base64 = btoa(url);
        return base64.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      }

      function generateBridgeUrl() {
        const hookshotUrl = hookshotInput.value.trim();
        if (!hookshotUrl) {
          showError('Please enter a Matrix Hookshot URL');
          return;
        }

        try {
          new URL(hookshotUrl);
          const base64Encoded = encodeBase64Url(hookshotUrl);
          const workerUrl = window.location.origin;
          const bridgeUrl = workerUrl + '/' + base64Encoded;

          originalUrlEl.textContent = hookshotUrl;
          base64UrlEl.textContent = base64Encoded;
          bridgeUrlEl.textContent = bridgeUrl;

          resultsDiv.classList.add('visible');
          resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {
          showError('Invalid URL format. Please enter a valid URL starting with http:// or https://');
        }
      }

      function copyToClipboard(elementId, button) {
        const text = document.getElementById(elementId).textContent;
        navigator.clipboard.writeText(text).then(() => {
          const originalText = button.textContent;
          button.textContent = 'Copied!';
          button.classList.add('copied');
          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
          }, 2000);
        }).catch(() => showError('Failed to copy to clipboard'));
      }

      generateBtn.addEventListener('click', generateBridgeUrl);
      hookshotInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') generateBridgeUrl();
      });
      hookshotInput.focus();
    </script>
  </div>
</body>
</html>
`;

app.get('/', (c) => {
  return c.html(HTML_PAGE);
});

/**
 * Main webhook handler - processes Slack payloads and forwards to Matrix
 *
 * Path structure: /<BASE64_ENCODED_MATRIX_WEBHOOK_URL>
 *
 * Request flow:
 * 1. Validate POST method
 * 2. Extract and decode Base64-encoded Matrix URL from path
 * 3. Parse Slack JSON payload
 * 4. Transform to Matrix format using transpiler
 * 5. Forward to Matrix Hookshot
 * 6. Return "Fake Slack" response
 */
app.post('/*', async (c) => {
  // ==========================================================================
  // 1. Request Validation and Routing
  // ==========================================================================

  // Slack webhooks are always POST
  // Return 405 Method Not Allowed for other HTTP methods
  if (c.req.method !== 'POST') {
    return c.text('Method not allowed. Please POST to this endpoint.', 405, {
      Allow: 'POST'
    });
  }

  // Extract the encoded destination from the URL path
  // Path structure: /<BASE64_DESTINATION_URL>
  // Slice(1) removes the leading slash
  const path = c.req.path;
  const encodedPath = path.slice(1);

  // Validate encoded path exists and is reasonable length
  if (!encodedPath || encodedPath.length < 5) {
    return c.text(
      'Error: Missing destination URL. Usage: /<Base64-Hookshot-URL>',
      400
    );
  }

  // Validate Base64 format before attempting decode
  if (!isValidBase64Url(encodedPath)) {
    return c.text(
      'Error: Invalid Base64 encoded destination URL.',
      400
    );
  }

  let matrixWebhookUrl: string;

  try {
    // Decode the path. Support both standard Base64 and Base64Url (URL-safe)
    // The transpiler's decodeMatrixUrl handles URL-safe character replacement
    matrixWebhookUrl = decodeMatrixUrl(encodedPath);

    // Security Check: Prevent SSRF (Server-Side Request Forgery)
    // Only allow http/https protocols
    if (
      !matrixWebhookUrl.startsWith('http://') &&
      !matrixWebhookUrl.startsWith('https://')
    ) {
      return c.text(
        'Error: Invalid protocol. Only http/https URLs are supported.',
        400
      );
    }
  } catch (e) {
    return c.text(
      'Error: Invalid Base64 encoded destination URL.',
      400
    );
  }

  // ==========================================================================
  // 2. Payload Ingestion
  // ==========================================================================

  let slackPayload: unknown;

  try {
    slackPayload = await c.req.json();
  } catch (e) {
    return c.text('invalid_payload: JSON required', 400);
  }

  // ==========================================================================
  // 3. Transformation (Slack --> Matrix)
  // ==========================================================================

  // Cast to SlackPayload type (we've validated it exists)
  const matrixPayload = transformSlackToMatrix(slackPayload as SlackPayload);

  // ==========================================================================
  // 4. Forwarding (The "Bridge" Action)
  // ==========================================================================

  try {
    const hookshotResponse = await fetch(matrixWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Slack-Matrix-Bridge/1.0'
      },
      body: JSON.stringify(matrixPayload)
    });

    // ========================================================================
    // 5. Response Handling ("Fake Slack")
    // ========================================================================

    if (hookshotResponse.ok) {
      // Slack expects a literal string "ok" with 200 status
      // This "Fake Slack" behavior keeps upstream integrations healthy
      return c.text('ok', 200, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
    } else {
      // If Matrix rejects it, forward the error details for debugging
      const errText = await hookshotResponse.text();
      return c.text(
        `Upstream Matrix Error: ${hookshotResponse.status} ${errText}`,
        hookshotResponse.status as 400 | 404 | 500 | 502 | 503
      );
    }
  } catch (e) {
    // Network failure or unreachable destination
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    return c.text(
      `Bridge Error: Failed to connect to Matrix destination. ${errorMessage}`,
      502
    );
  }
});

export default app;
