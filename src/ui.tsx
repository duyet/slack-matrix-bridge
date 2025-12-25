import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'

const app = new Hono()

// UI Generator Route - GET /
app.get(
  '/',
  jsxRenderer(({ children }) => {
    return (
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Slack-Matrix Bridge URL Generator</title>
          <meta name="description" content="Generate Bridge URLs for Slack-to-Matrix webhooks" />
          <style>{`
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
              --border-hover: #cbd5e1;
              --success: #10b981;
              --success-light: #d1fae5;
              --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
              --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
              --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
              --radius: 12px;
              --radius-sm: 8px;
            }

            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
              min-height: 100vh;
              color: var(--text-primary);
              line-height: 1.6;
              padding: 20px;
            }

            .container {
              max-width: 800px;
              margin: 0 auto;
              padding: 40px 20px;
            }

            .header {
              text-align: center;
              margin-bottom: 48px;
            }

            .logo {
              width: 64px;
              height: 64px;
              margin: 0 auto 20px;
              background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
              border-radius: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: var(--shadow-lg);
            }

            .logo svg {
              width: 36px;
              height: 36px;
              color: white;
            }

            h1 {
              font-size: 2.5rem;
              font-weight: 700;
              margin-bottom: 12px;
              background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }

            .subtitle {
              color: var(--text-secondary);
              font-size: 1.125rem;
            }

            .card {
              background: var(--card-bg);
              border-radius: var(--radius);
              box-shadow: var(--shadow);
              padding: 32px;
              margin-bottom: 24px;
              border: 1px solid var(--border);
            }

            .input-group {
              margin-bottom: 24px;
            }

            label {
              display: block;
              font-weight: 600;
              font-size: 0.9375rem;
              color: var(--text-primary);
              margin-bottom: 8px;
            }

            .input-wrapper {
              position: relative;
            }

            input[type="url"] {
              width: 100%;
              padding: 14px 16px;
              font-size: 1rem;
              border: 2px solid var(--border);
              border-radius: var(--radius-sm);
              transition: all 0.2s ease;
              outline: none;
              background: var(--card-bg);
              color: var(--text-primary);
            }

            input[type="url"]:focus {
              border-color: var(--primary);
              box-shadow: 0 0 0 3px var(--primary-light);
            }

            input[type="url"]::placeholder {
              color: var(--text-muted);
            }

            .btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              padding: 14px 28px;
              font-size: 1rem;
              font-weight: 600;
              border: none;
              border-radius: var(--radius-sm);
              cursor: pointer;
              transition: all 0.2s ease;
              width: 100%;
            }

            .btn-primary {
              background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
              color: white;
              box-shadow: var(--shadow);
            }

            .btn-primary:hover {
              transform: translateY(-1px);
              box-shadow: var(--shadow-lg);
            }

            .btn-primary:active {
              transform: translateY(0);
            }

            .btn-copy {
              background: var(--primary-light);
              color: var(--primary);
              padding: 10px 20px;
              font-size: 0.875rem;
              width: auto;
            }

            .btn-copy:hover {
              background: var(--primary);
              color: white;
            }

            .btn-copy.copied {
              background: var(--success);
              color: white;
            }

            .results {
              display: none;
              animation: slideDown 0.3s ease;
            }

            .results.visible {
              display: block;
            }

            @keyframes slideDown {
              from {
                opacity: 0;
                transform: translateY(-10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            .result-item {
              margin-bottom: 24px;
            }

            .result-item:last-child {
              margin-bottom: 0;
            }

            .result-label {
              font-size: 0.8125rem;
              font-weight: 600;
              color: var(--text-secondary);
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 8px;
            }

            .result-box {
              background: var(--bg-gradient-start);
              border: 1px solid var(--border);
              border-radius: var(--radius-sm);
              padding: 16px;
              font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
              font-size: 0.875rem;
              color: var(--text-primary);
              word-break: break-all;
              line-height: 1.6;
              position: relative;
            }

            .result-box.highlight {
              background: var(--success-light);
              border-color: var(--success);
            }

            .copy-btn-wrapper {
              display: flex;
              gap: 12px;
              margin-top: 12px;
            }

            .divider {
              height: 1px;
              background: var(--border);
              margin: 32px 0;
            }

            .instructions {
              margin-top: 32px;
            }

            .instructions h2 {
              font-size: 1.5rem;
              font-weight: 700;
              margin-bottom: 16px;
              color: var(--text-primary);
            }

            .steps {
              list-style: none;
              counter-reset: step-counter;
            }

            .steps li {
              position: relative;
              padding-left: 48px;
              margin-bottom: 20px;
            }

            .steps li:last-child {
              margin-bottom: 0;
            }

            .steps li::before {
              counter-increment: step-counter;
              content: counter(step-counter);
              position: absolute;
              left: 0;
              top: 0;
              width: 32px;
              height: 32px;
              background: var(--primary);
              color: white;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 700;
              font-size: 0.875rem;
            }

            .steps strong {
              display: block;
              font-weight: 600;
              margin-bottom: 4px;
              color: var(--text-primary);
            }

            .steps p {
              color: var(--text-secondary);
              font-size: 0.9375rem;
            }

            .steps code {
              background: var(--bg-gradient-start);
              padding: 2px 6px;
              border-radius: 4px;
              font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
              font-size: 0.875rem;
              color: var(--primary);
            }

            .error {
              display: none;
              background: #fee2e2;
              border: 1px solid #fecaca;
              color: #991b1b;
              padding: 12px 16px;
              border-radius: var(--radius-sm);
              margin-bottom: 20px;
              font-size: 0.9375rem;
            }

            .error.visible {
              display: block;
              animation: shake 0.4s ease;
            }

            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              25% { transform: translateX(-5px); }
              75% { transform: translateX(5px); }
            }

            .footer {
              text-align: center;
              margin-top: 48px;
              color: var(--text-muted);
              font-size: 0.875rem;
            }

            .footer a {
              color: var(--primary);
              text-decoration: none;
            }

            .footer a:hover {
              text-decoration: underline;
            }

            @media (max-width: 640px) {
              h1 {
                font-size: 1.875rem;
              }

              .subtitle {
                font-size: 1rem;
              }

              .card {
                padding: 24px;
              }

              .steps li {
                padding-left: 40px;
              }

              .copy-btn-wrapper {
                flex-direction: column;
              }

              .btn-copy {
                width: 100%;
              }
            }
          `}</style>
        </head>
        <body>
          {children}
        </body>
      </html>
    )
  })
)

app.get('/', (c) => {
  return c.render(
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

        <div class="input-group">
          <label for="hookshotUrl">Matrix Hookshot URL</label>
          <div class="input-wrapper">
            <input
              type="url"
              id="hookshotUrl"
              placeholder="https://hookshot.example.com/webhooks/v2/abcdef123456"
              required
            />
          </div>
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

      <div class="card instructions">
        <h2>How to Use</h2>
        <ol class="steps">
          <li>
            <strong>Create a Matrix Webhook</strong>
            <p>Invite the <code>Hookshot</code> bot to your Matrix room and send: <code>!hookshot webhook create Bridge</code></p>
          </li>
          <li>
            <strong>Generate Bridge URL</strong>
            <p>Paste your Matrix Hookshot URL above and click "Generate Bridge URL"</p>
          </li>
          <li>
            <strong>Configure Your Service</strong>
            <p>In your third-party service (GitHub, Grafana, etc.), select "Slack" as integration and paste the Bridge URL</p>
          </li>
          <li>
            <strong>Test the Integration</strong>
            <p>Trigger a test notification from your service. It should appear in your Matrix room!</p>
          </li>
        </ol>
      </div>

      <div class="footer">
        <p>
          Powered by <a href="https://workers.cloudflare.com" target="_blank" rel="noopener">Cloudflare Workers</a> &bull;
          <a href="https://matrix.org" target="_blank" rel="noopener">Matrix</a>
        </p>
      </div>

      <script>{`
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
          setTimeout(() => {
            errorDiv.classList.remove('visible');
          }, 5000);
        }

        function encodeBase64Url(url) {
          // Convert to Base64
          const base64 = btoa(url);
          // Make it URL-safe
          return base64.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
        }

        function generateBridgeUrl() {
          const hookshotUrl = hookshotInput.value.trim();

          if (!hookshotUrl) {
            showError('Please enter a Matrix Hookshot URL');
            return;
          }

          try {
            // Validate URL format
            new URL(hookshotUrl);

            // Generate Base64 encoded version
            const base64Encoded = encodeBase64Url(hookshotUrl);

            // Get current worker URL
            const workerUrl = window.location.origin;

            // Construct bridge URL
            const bridgeUrl = \`\${workerUrl}/\${base64Encoded}\`;

            // Display results
            originalUrlEl.textContent = hookshotUrl;
            base64UrlEl.textContent = base64Encoded;
            bridgeUrlEl.textContent = bridgeUrl;

            // Show results with animation
            resultsDiv.classList.add('visible');

            // Scroll to results
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
          }).catch(() => {
            showError('Failed to copy to clipboard');
          });
        }

        // Event listeners
        generateBtn.addEventListener('click', generateBridgeUrl);

        hookshotInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            generateBridgeUrl();
          }
        });

        // Focus input on load
        hookshotInput.focus();
      `}</script>
    </div>
  )
})

export default app
