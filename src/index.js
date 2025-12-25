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
import { transformSlackToMatrix, decodeMatrixUrl, isValidBase64Url } from './transpiler';
const app = new Hono();
/**
 * Root endpoint - health check and information
 */
app.get('/', (c) => {
    return c.html(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Slack-Matrix Bridge</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
          h1 { color: #333; border-bottom: 2px solid #4A154B; padding-bottom: 10px; }
          .status { background: #e7f5e9; color: #1a7f37; padding: 10px 15px; border-radius: 6px; display: inline-block; margin: 20px 0; }
          code { background: #f6f8fa; padding: 2px 6px; border-radius: 4px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
          .endpoint { background: #f6f8fa; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .endpoint p { margin: 5px 0; }
        </style>
      </head>
      <body>
        <h1>Slack-to-Matrix Bridge</h1>
        <div class="status">Status: Running</div>
        <p>A stateless webhook bridge that converts Slack messages to Matrix format.</p>
        <div class="endpoint">
          <p><strong>Webhook Endpoint:</strong></p>
          <p><code>POST /&lt;base64-encoded-matrix-url&gt;</code></p>
        </div>
        <p>The Matrix Hookshot URL must be Base64-encoded and placed in the path.</p>
      </body>
    </html>
  `);
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
            'Allow': 'POST'
        });
    }
    // Extract the encoded destination from the URL path
    // Path structure: /<BASE64_DESTINATION_URL>
    // Slice(1) removes the leading slash
    const path = c.req.path;
    const encodedPath = path.slice(1);
    // Validate encoded path exists and is reasonable length
    if (!encodedPath || encodedPath.length < 5) {
        return c.text('Error: Missing destination URL. Usage: /<Base64-Hookshot-URL>', 400);
    }
    // Validate Base64 format before attempting decode
    if (!isValidBase64Url(encodedPath)) {
        return c.text('Error: Invalid Base64 encoded destination URL.', 400);
    }
    let matrixWebhookUrl;
    try {
        // Decode the path. Support both standard Base64 and Base64Url (URL-safe)
        // The transpiler's decodeMatrixUrl handles URL-safe character replacement
        matrixWebhookUrl = decodeMatrixUrl(encodedPath);
        // Security Check: Prevent SSRF (Server-Side Request Forgery)
        // Only allow http/https protocols
        if (!matrixWebhookUrl.startsWith('http://') && !matrixWebhookUrl.startsWith('https://')) {
            return c.text('Error: Invalid protocol. Only http/https URLs are supported.', 400);
        }
    }
    catch (e) {
        return c.text('Error: Invalid Base64 encoded destination URL.', 400);
    }
    // ==========================================================================
    // 2. Payload Ingestion
    // ==========================================================================
    let slackPayload;
    try {
        slackPayload = await c.req.json();
    }
    catch (e) {
        return c.text('invalid_payload: JSON required', 400);
    }
    // ==========================================================================
    // 3. Transformation (Slack --> Matrix)
    // ==========================================================================
    const matrixPayload = transformSlackToMatrix(slackPayload);
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
        }
        else {
            // If Matrix rejects it, forward the error details for debugging
            const errText = await hookshotResponse.text();
            return c.text(`Upstream Matrix Error: ${hookshotResponse.status} ${errText}`, hookshotResponse.status);
        }
    }
    catch (e) {
        // Network failure or unreachable destination
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        return c.text(`Bridge Error: Failed to connect to Matrix destination. ${errorMessage}`, 502);
    }
});
export default app;
