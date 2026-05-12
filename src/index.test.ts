/**
 * Comprehensive tests for Slack-to-Matrix Bridge Worker
 *
 * Tests cover:
 * - POST request handling with valid payloads
 * - Route behavior for unsupported methods on webhook paths
 * - Base64 URL validation (400 for invalid Base64)
 * - Protocol validation (400 for non-HTTP protocols)
 * - Successful webhook forwarding (returns "ok")
 * - Error handling for various failure scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from './index';
import type { SlackPayload } from './transpiler';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Helper function to create a test request
 */
function createRequest(method: string, path: string, body?: unknown): Request {
  const url = `http://localhost${path}`;
  const init: RequestInit = {
    method,
  };

  if (body !== undefined) {
    init.headers = {
      'Content-Type': 'application/json',
    };
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

/**
 * Helper to encode a Matrix URL as Base64 (URL-safe)
 */
function encodeMatrixUrl(url: string): string {
  const base64 = btoa(url);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Helper to create a valid Slack payload for testing
 */
function createSlackPayload(overrides?: Partial<SlackPayload>): SlackPayload {
  return {
    text: 'Test message from Slack',
    username: 'TestBot',
    ...overrides,
  };
}

// ============================================================================
// HTTP Method Validation Tests
// ============================================================================

describe('HTTP method validation', () => {
  it('should return 404 for GET requests on non-root webhook paths', async () => {
    const request = createRequest('GET', '/test-path');
    const response = await app.request(request, env);

    expect(response.status).toBe(404);
  });

  it('should return 404 for PUT requests on non-root webhook paths', async () => {
    const request = createRequest('PUT', '/test-path', { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(404);
  });

  it('should return 404 for DELETE requests on non-root webhook paths', async () => {
    const request = createRequest('DELETE', '/test-path');
    const response = await app.request(request, env);

    expect(response.status).toBe(404);
  });

  it('should return 404 for PATCH requests on non-root webhook paths', async () => {
    const request = createRequest('PATCH', '/test-path', { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(404);
  });

  it('should return 404 for HEAD requests on non-root webhook paths', async () => {
    const request = createRequest('HEAD', '/test-path');
    const response = await app.request(request, env);

    expect(response.status).toBe(404);
  });

  it('should return 404 for OPTIONS requests on non-root webhook paths', async () => {
    const request = createRequest('OPTIONS', '/test-path');
    const response = await app.request(request, env);

    expect(response.status).toBe(404);
  });
});

// ============================================================================
// Base64 URL Validation Tests
// ============================================================================

describe('Base64 URL validation', () => {
  it('should return 400 for empty path', async () => {
    const request = createRequest('POST', '/', { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Missing destination URL');
    expect(text).toContain('Base64');
  });

  it('should return 400 for path shorter than 5 characters', async () => {
    const request = createRequest('POST', '/abc', { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Missing destination URL');
  });

  it('should return 400 for invalid Base64 characters', async () => {
    const request = createRequest('POST', '/not-valid-base64!@#', { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Invalid Base64');
  });

  it('should return 400 for Base64 that decodes to gibberish', async () => {
    const request = createRequest('POST', '/invalid-base64-content', { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Invalid Base64');
  });

  it('should accept valid standard Base64 encoding', async () => {
    // We need to mock fetch since we don't have a real Matrix endpoint
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    // Mock the fetch to avoid actual network calls
    global.fetch = async () =>
      new Response('ok', { status: 200 });

    const request = createRequest('POST', `/${encodedPath}`, { text: 'test' });
    const response = await app.request(request, env);

    // Should not return 400 for Base64 validation
    // It might return other status codes depending on fetch mock, but not 400 for Base64
    expect(response.status).not.toBe(400);
  });

  it('should accept URL-safe Base64 encoding', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    // Create URL-safe Base64
    const base64 = btoa(matrixUrl);
    const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_');

    global.fetch = async () =>
      new Response('ok', { status: 200 });

    const request = createRequest('POST', `/${urlSafe}`, { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).not.toBe(400);
  });
});

// ============================================================================
// Protocol Validation Tests (SSRF Prevention)
// ============================================================================

describe('Protocol validation (SSRF prevention)', () => {
  it('should return 400 for ftp:// URLs', async () => {
    const ftpUrl = 'ftp://example.com/webhook';
    const encodedPath = encodeMatrixUrl(ftpUrl);

    const request = createRequest('POST', `/${encodedPath}`, { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Invalid Base64');
  });

  it('should return 400 for file:// URLs', async () => {
    const fileUrl = 'file:///etc/passwd';
    const encodedPath = encodeMatrixUrl(fileUrl);

    const request = createRequest('POST', `/${encodedPath}`, { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Invalid Base64');
  });

  it('should return 400 for javascript:// URLs', async () => {
    const jsUrl = 'javascript:alert(1)';
    const encodedPath = encodeMatrixUrl(jsUrl);

    const request = createRequest('POST', `/${encodedPath}`, { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Invalid Base64');
  });

  it('should return 400 for data:// URLs', async () => {
    const dataUrl = 'data:text/html,<script>alert(1)</script>';
    const encodedPath = encodeMatrixUrl(dataUrl);

    const request = createRequest('POST', `/${encodedPath}`, { text: 'test' });
    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Invalid Base64');
  });

  it('should accept http:// URLs', async () => {
    const httpUrl = 'http://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(httpUrl);

    global.fetch = async () =>
      new Response('ok', { status: 200 });

    const request = createRequest('POST', `/${encodedPath}`, { text: 'test' });
    const response = await app.request(request, env);

    // Should pass protocol validation
    expect(response.status).not.toBe(400);
  });

  it('should accept https:// URLs', async () => {
    const httpsUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(httpsUrl);

    global.fetch = async () =>
      new Response('ok', { status: 200 });

    const request = createRequest('POST', `/${encodedPath}`, { text: 'test' });
    const response = await app.request(request, env);

    // Should pass protocol validation
    expect(response.status).not.toBe(400);
  });
});

// ============================================================================
// Payload Parsing Tests
// ============================================================================

describe('Payload parsing', () => {
  it('should return 400 for invalid JSON', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    const request = new Request(`http://localhost/${encodedPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid json{{{',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('invalid_payload');
    expect(text).toContain('JSON');
  });

  it('should return 400 for malformed JSON', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    const request = new Request(`http://localhost/${encodedPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{text: missing quotes}',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(400);
  });

  it('should parse valid JSON payload', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    let capturedBody: string | undefined;
    global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response('ok', { status: 200 });
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Hello from Slack',
      username: 'TestBot',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(200);
    expect(capturedBody).toBeDefined();

    const parsedBody = JSON.parse(capturedBody!);
    expect(parsedBody.text).toContain('Hello from Slack');
  });
});

// ============================================================================
// Successful Webhook Forwarding Tests
// ============================================================================

describe('Successful webhook forwarding', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = async () =>
      new Response('ok', { status: 200 });
  });

  it('should return "ok" for successful webhook', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toBe('ok');
  });

  it('should set correct Content-Type header', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it('should forward transformed payload to Matrix', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    let capturedInit: RequestInit | undefined;

    global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      capturedBody = init?.body as string;
      return new Response('ok', { status: 200 });
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      text: '*Bold* message',
      username: 'SlackBot',
    });

    await app.request(request, env);

    expect(capturedUrl).toBe(matrixUrl);
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'User-Agent': 'Slack-Matrix-Bridge/1.0',
    });

    const parsedBody = JSON.parse(capturedBody!);
    expect(parsedBody.text).toBe('*Bold* message');
  });

  it('should forward Block Kit payload', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    let capturedBody: string | undefined;

    global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response('ok', { status: 200 });
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: 'Block content' }
        }
      ]
    });

    await app.request(request, env);

    const parsedBody = JSON.parse(capturedBody!);
    expect(parsedBody.text).toContain('Block content');
  });

  it('should forward attachment payload', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    let capturedBody: string | undefined;

    global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response('ok', { status: 200 });
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      attachments: [
        {
          color: 'good',
          title: 'Success',
          text: 'Operation completed'
        }
      ]
    });

    await app.request(request, env);

    const parsedBody = JSON.parse(capturedBody!);
    expect(parsedBody.text).toContain('🟢 Success');
  });
});

// ============================================================================
// Matrix Error Forwarding Tests
// ============================================================================

describe('Matrix error forwarding', () => {
  it('should forward 404 errors from Matrix', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    global.fetch = async () =>
      new Response('Webhook not found', { status: 404 });

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(404);

    const text = await response.text();
    expect(text).toContain('Upstream Matrix Error');
    expect(text).toContain('404');
    expect(text).toContain('Webhook not found');
  });

  it('should forward 500 errors from Matrix', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    global.fetch = async () =>
      new Response('Internal server error', { status: 500 });

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(500);

    const text = await response.text();
    expect(text).toContain('Upstream Matrix Error');
    expect(text).toContain('500');
  });

  it('should forward 502 Bad Gateway errors from Matrix', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    global.fetch = async () =>
      new Response('Bad gateway', { status: 502 });

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(502);

    const text = await response.text();
    expect(text).toContain('Upstream Matrix Error');
  });

  it('should forward 503 Service Unavailable errors from Matrix', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    global.fetch = async () =>
      new Response('Service unavailable', { status: 503 });

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(503);

    const text = await response.text();
    expect(text).toContain('Upstream Matrix Error');
  });

  it('should forward 400 Bad Request errors from Matrix', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    global.fetch = async () =>
      new Response('Invalid payload format', { status: 400 });

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(400);

    const text = await response.text();
    expect(text).toContain('Upstream Matrix Error');
    expect(text).toContain('Invalid payload format');
  });
});

// ============================================================================
// Network Error Handling Tests
// ============================================================================

describe('Network error handling', () => {
  it('should return 502 for network failures', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    global.fetch = async () => {
      throw new Error('Network connection failed');
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(502);

    const text = await response.text();
    expect(text).toContain('Bridge Error');
    expect(text).toContain('Failed to connect');
    expect(text).toContain('Network connection failed');
  });

  it('should return 502 for timeout errors', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    global.fetch = async () => {
      throw new Error('Request timeout');
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(502);

    const text = await response.text();
    expect(text).toContain('Request timeout');
  });

  it('should handle unknown error types', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    global.fetch = async () => {
      throw 'String error';
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Test message',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(502);

    const text = await response.text();
    expect(text).toContain('Bridge Error');
    expect(text).toContain('Unknown error');
  });
});

// ============================================================================
// Root Endpoint Tests
// ============================================================================

describe('Root endpoint', () => {
  it('should return HTML URL generator page', async () => {
    const request = new Request('http://localhost/', {
      method: 'GET',
    });

    const response = await app.request(request, env);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('Slack-Matrix Bridge');
    expect(html).toContain('Generate Bridge URL');
    expect(html).toContain('Matrix Hookshot URL');
  });

  it('should show URL generation result labels', async () => {
    const request = new Request('http://localhost/', {
      method: 'GET',
    });

    const response = await app.request(request, env);

    const html = await response.text();
    expect(html).toContain('Base64 Encoded');
    expect(html).toContain('Final Bridge URL');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration tests', () => {
  it('should handle complete Slack webhook flow', async () => {
    const matrixUrl = 'https://matrix.example.com/_matrix/hooks/slack/abc123';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    let capturedRequest: Request | undefined;

    global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedRequest = new Request(url, init);
      return new Response('ok', { status: 200 });
    };

    const slackPayload = createSlackPayload({
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Deployment Status' }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Production deployment *successful*'
          }
        }
      ],
      attachments: [
        {
          color: 'good',
          fields: [
            { title: 'Environment', value: 'production', short: true },
            { title: 'Duration', value: '2m 34s', short: true }
          ]
        }
      ]
    });

    const request = createRequest('POST', `/${encodedPath}`, slackPayload);
    const response = await app.request(request, env);

    // Verify response to Slack
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');

    // Verify Matrix webhook was called correctly
    expect(capturedRequest).toBeDefined();

    const matrixBody = await capturedRequest!.json();
    expect(matrixBody.text).toContain('Deployment Status');
    expect(matrixBody.text).toContain('Environment: production');
  });

  it('should handle complex mrkdwn with links and formatting', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    let capturedBody: string | undefined;

    global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response('ok', { status: 200 });
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'See <https://example.com/docs|documentation> for details. *Important* notes inside `code` blocks.'
    });

    await app.request(request, env);

    const matrixPayload = JSON.parse(capturedBody!);
    expect(matrixPayload.text).toContain('https://example.com/docs');
    expect(matrixPayload.text).toContain('documentation');
    expect(matrixPayload.text).toContain('*Important*');
    expect(matrixPayload.text).toContain('`code`');
  });

  it('should preserve special characters in text', async () => {
    const matrixUrl = 'https://matrix.example.com/webhook';
    const encodedPath = encodeMatrixUrl(matrixUrl);

    let capturedBody: string | undefined;

    global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response('ok', { status: 200 });
    };

    const request = createRequest('POST', `/${encodedPath}`, {
      text: 'Special chars: < > & " \' and emojis: 🎉 🚀 ✅'
    });

    await app.request(request, env);

    const matrixPayload = JSON.parse(capturedBody!);
    expect(matrixPayload.text).toContain('< > & " \'');
    expect(matrixPayload.text).toContain('🎉');
    expect(matrixPayload.text).toContain('🚀');
  });
});
