/**
 * Smoke tests: Bugsink Slack payloads through the worker, asserting
 * the Hookshot body keeps headings, fields, links, and html.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from './index';
import { transformSlackToMatrix, type SlackPayload } from './transpiler';

function encodeMatrixUrl(url: string): string {
  return btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function createRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const bugsinkTestPayload: SlackPayload = {
  text: 'TEST issue',
  blocks: [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'TEST issue' },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Test message by Bugsink to test the webhook setup.',
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: '*project*: dev-api' },
        { type: 'mrkdwn', text: '*message backend*: private-dp-bugsink' },
      ],
    },
  ],
};

export const bugsinkAlertPayload: SlackPayload = {
  text: 'TypeError: cannot read property of undefined',
  username: 'Bugsink',
  blocks: [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'TypeError: cannot read property of undefined' },
    },
    {
      type: 'section',
      text: { type: 'plain_text', text: 'NEW issue' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: '*project*: dev-api' },
        { type: 'mrkdwn', text: '*environment*: production' },
        { type: 'mrkdwn', text: '*server*: api-1' },
        { type: 'mrkdwn', text: '*message backend*: private-dp-bugsink' },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '<https://bugsink.example/issues/issue/abc/event/last/|view on Bugsink>',
      },
    },
  ],
};

function assertQuality(forwarded: {
  text?: string;
  html?: string;
  formatted_body?: string;
  username?: string;
  external_url?: string;
}): void {
  expect(forwarded.html).toBeTruthy();
  expect(forwarded.formatted_body).toBe(forwarded.html);
  expect(forwarded.text).not.toContain('Debug metadata');
  expect(forwarded.html).not.toContain('Debug metadata');
  expect(forwarded.html).not.toMatch(/##\s/);
}

describe('smoke: Bugsink conversion quality', () => {
  it('formats the Bugsink test message', () => {
    const result = transformSlackToMatrix(bugsinkTestPayload);
    assertQuality(result);
    expect(result.html).toContain('<h3>TEST issue</h3>');
    expect(result.html).toContain('<strong>project:</strong> dev-api');
    expect(result.html).toContain('<strong>message backend:</strong> private-dp-bugsink');
    expect(result.text).toContain('project: dev-api');
  });

  it('formats a Bugsink alert with project, env, server, and issue link', () => {
    const result = transformSlackToMatrix(bugsinkAlertPayload);
    assertQuality(result);
    expect(result.username).toBe('Bugsink');
    expect(result.html).toContain('<h3>TypeError: cannot read property of undefined</h3>');
    expect(result.text).toContain('NEW issue');
    expect(result.html).toContain('<strong>project:</strong> dev-api');
    expect(result.html).toContain('<strong>environment:</strong> production');
    expect(result.html).toContain('<strong>server:</strong> api-1');
    expect(result.html).toContain('<strong>message backend:</strong> private-dp-bugsink');
    expect(result.text).toContain('message backend: private-dp-bugsink');
    expect(result.html).not.toContain('view on Bugsink');
    expect(result.html).not.toContain('bugsink.example');
    expect(result.text).not.toContain('view on Bugsink');
    expect(result.external_url).toBeUndefined();
  });
});

describe('smoke: worker forwards Hookshot html', () => {
  const matrixUrl = 'https://matrix.example.com/webhook';
  const encodedPath = encodeMatrixUrl(matrixUrl);
  let capturedBody: string | undefined;

  beforeEach(() => {
    capturedBody = undefined;
    global.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response('ok', { status: 200 });
    };
  });

  it('returns ok and forwards html for a Bugsink test payload', async () => {
    const response = await app.request(
      createRequest(`/${encodedPath}`, bugsinkTestPayload),
      env
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');

    const forwarded = JSON.parse(capturedBody!);
    assertQuality(forwarded);
    expect(forwarded.html).toContain('<h3>TEST issue</h3>');
    expect(forwarded.html).toContain('<strong>project:</strong> dev-api');
    expect(forwarded.html).toContain('<strong>message backend:</strong> private-dp-bugsink');
  });

  it('returns ok and forwards html for a Bugsink alert payload', async () => {
    const response = await app.request(
      createRequest(`/${encodedPath}`, bugsinkAlertPayload),
      env
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');

    const forwarded = JSON.parse(capturedBody!);
    assertQuality(forwarded);
    expect(forwarded.username).toBe('Bugsink');
    expect(forwarded.html).toContain('<strong>project:</strong> dev-api');
    expect(forwarded.html).toContain('<strong>environment:</strong> production');
    expect(forwarded.html).toContain('<strong>server:</strong> api-1');
    expect(forwarded.html).toContain('<strong>message backend:</strong> private-dp-bugsink');
    expect(forwarded.html).not.toContain('view on Bugsink');
    expect(forwarded.text).not.toContain('view on Bugsink');
    expect(forwarded.html).not.toContain('bugsink.example');
    expect(forwarded.text).not.toContain('bugsink.example');
    expect(forwarded.external_url).toBeUndefined();
  });
});
