/**
 * Comprehensive tests for Slack-to-Matrix transpiler
 *
 * Tests cover:
 * - Block Kit parsing (section, header, context, divider, image)
 * - Legacy attachment parsing
 * - End-to-end transformation
 */

import { describe, it, expect } from 'vitest';
import {
  transformSlackToMatrix,
  isValidBase64Url,
  decodeMatrixUrl,
  type SlackPayload,
} from './transpiler';

// ============================================================================
// Block Kit Parser Tests
// ============================================================================

describe('Block Kit parsing', () => {
  describe('section blocks', () => {
    it('should parse section with text', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: 'Section text' }
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Section text');
    });

    it('should parse section with fields', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'section',
            fields: [
              { title: 'Field 1', value: 'Value 1', short: true },
              { title: 'Field 2', value: 'Value 2', short: true }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Field 1: Value 1');
      expect(result.text).toContain('Field 2: Value 2');
    });

    it('should parse section with text and fields', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: '*Header*' },
            fields: [
              { value: 'Field value' }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('*Header*');
      expect(result.text).toContain('- Field value');
    });
  });

  describe('header blocks', () => {
    it('should parse header block', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Important Header' }
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('## Important Header');
    });
  });

  describe('context blocks', () => {
    it('should parse context block with elements', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: 'Metadata' },
              { type: 'plain_text', text: 'More info' }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Metadata More info');
    });
  });

  describe('divider blocks', () => {
    it('should parse divider block', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'divider'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('---');
    });
  });

  describe('image blocks', () => {
    it('should parse image block with URL and alt text', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'image',
            image_url: 'https://example.com/image.png',
            alt_text: 'Example image'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('[Image: Example image]');
      expect(result.text).toContain('https://example.com/image.png');
    });

    it('should handle image block without alt text', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'image',
            image_url: 'https://example.com/image.png'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('[Image: Image]');
    });
  });

  describe('unknown block types', () => {
    it('should ignore unknown block types', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'unknown_type',
            text: { type: 'plain_text', text: 'Should be ignored' }
          } as any
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).not.toContain('Should be ignored');
      expect(result.text).toBe('Received empty Slack payload');
    });
  });

  describe('multiple blocks', () => {
    it('should parse multiple blocks in sequence', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Title' }
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: 'Content' }
          },
          {
            type: 'divider'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('## Title');
      expect(result.text).toContain('Content');
      expect(result.text).toContain('---');
    });
  });
});

// ============================================================================
// Legacy Attachment Parser Tests
// ============================================================================

describe('Legacy attachment parsing', () => {
  describe('color mapping', () => {
    it('should map danger color to red circle', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            color: 'danger',
            title: 'Error occurred'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('🔴 Error occurred');
    });

    it('should map good color to green circle', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            color: 'good',
            title: 'Success'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('🟢 Success');
    });

    it('should map warning color to warning emoji', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            color: 'warning',
            title: 'Warning'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('⚠️ Warning');
    });

    it('should map hex colors starting with #d to danger', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            color: '#d00000',
            title: 'Error'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('🔴');
    });

    it('should map hex colors starting with #36 to good', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            color: '#36a64f',
            title: 'Success'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('🟢');
    });

    it('should map default colors to blue circle', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            color: '#0000ff',
            title: 'Info'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('🔵 Info');
    });

    it('should not add emoji when no color is specified', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            title: 'Plain message'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).not.toMatch(/^[🔴🟢⚠️🔵]/);
    });
  });

  describe('attachment structure', () => {
    it('should parse attachment with all fields', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            color: 'good',
            pretext: 'Pre-text appears above',
            title: 'Attachment Title',
            title_link: 'https://example.com',
            text: 'Main content goes here',
            fields: [
              { title: 'Field 1', value: 'Value 1', short: true },
              { title: 'Field 2', value: 'Value 2', short: true }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Pre-text appears above');
      expect(result.text).toContain('Attachment Title');
      expect(result.text).toContain('https://example.com');
      expect(result.text).toContain('Main content goes here');
      expect(result.text).toContain('Field 1: Value 1');
      expect(result.text).toContain('Field 2: Value 2');
    });

    it('should parse attachment without title link', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            title: 'Plain title'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Plain title');
      expect(result.text).not.toContain('<');
    });

    it('should parse attachment with fields only', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            fields: [
              { title: 'Status', value: 'Active' }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Status: Active');
    });

    it('should handle attachment without field titles', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            fields: [
              { value: 'Just a value' }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('- Just a value');
    });
  });

  describe('multiple attachments', () => {
    it('should parse multiple attachments in sequence', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            color: 'good',
            title: 'First attachment'
          },
          {
            color: 'danger',
            title: 'Second attachment'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('🟢 First attachment');
      expect(result.text).toContain('🔴 Second attachment');
    });
  });
});

// ============================================================================
// Main Transform Function Tests
// ============================================================================

describe('transformSlackToMatrix', () => {
  describe('priority handling', () => {
    it('should prioritize blocks over attachments', () => {
      const payload: SlackPayload = {
        text: 'Fallback text',
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: 'Block content' }
          }
        ],
        attachments: [
          {
            title: 'Attachment content'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Block content');
      expect(result.text).toContain('Attachment content');
      expect(result.text).not.toContain('Fallback text');
    });

    it('should use attachments when no blocks', () => {
      const payload: SlackPayload = {
        text: 'Fallback text',
        attachments: [
          {
            title: 'Attachment content'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Attachment content');
      expect(result.text).not.toContain('Fallback text');
    });

    it('should use text as fallback when no blocks or attachments', () => {
      const payload: SlackPayload = {
        text: 'Simple message'
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toBe('Simple message');
    });

    it('should use fallback when payload is empty', () => {
      const payload: SlackPayload = {};

      const result = transformSlackToMatrix(payload);

      expect(result.text).toBe('Received empty Slack payload');
    });

    it('should remove undefined artifact lines from body content', () => {
      const payload: SlackPayload = {
        content: {
          body: '## NEW issue\n- undefined\nActual message'
        }
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('## NEW issue');
      expect(result.text).toContain('Actual message');
      expect(result.text).not.toContain('- undefined');
    });
  });

  describe('username handling', () => {
    it('should include username from payload', () => {
      const payload: SlackPayload = {
        username: 'TestBot',
        text: 'Message'
      };

      const result = transformSlackToMatrix(payload);

      expect(result.username).toBe('TestBot');
    });
  });

  describe('metadata enrichment', () => {
    it('should append source URL and only safe metadata in normal mode', () => {
      const payload: SlackPayload = {
        content: {
          body: '<https://example.com/issues/1|Issue Link>',
          msgtype: 'm.notice'
        },
        event_id: '$event123',
        room_id: '!room:example.com',
        sender: '@bot:example.com',
        origin_server_ts: 1714564800000
      };

      const result = transformSlackToMatrix(payload);

      expect(result.external_url).toBe('https://example.com/issues/1');
      expect(result.text).toContain('Upstream source: https://example.com/issues/1');
      expect(result.text).not.toContain('Event ID: $event123');
      expect(result.text).not.toContain('Room ID: !room:example.com');
      expect(result.text).not.toContain('Sender: @bot:example.com');
      expect(result.text).toContain('Source msgtype: m.notice');
      expect(result.format).toBe('org.matrix.custom.html');
      expect(result.formatted_body).not.toContain('&lt;https://example.com/issues/1|Issue Link&gt;');
      expect(result.formatted_body).toMatch(
        /<a href="https:\/\/example\.com\/issues\/1">\s*Issue Link\s*<\/a>/
      );
    });

    it('should include internal IDs only when debug metadata mode is enabled', () => {
      const payload: SlackPayload = {
        enableDebugMetadata: true,
        content: {
          body: '<https://example.com/issues/1|Issue Link>',
          msgtype: 'm.notice'
        },
        event_id: '$event123',
        room_id: '!room:example.com',
        sender: '@bot:example.com',
        origin_server_ts: 1714564800000
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('Event ID: $event123');
      expect(result.text).toContain('Room ID: !room:example.com');
      expect(result.text).toContain('Sender: @bot:example.com');
    });

    it('should trim trailing punctuation from extracted source URLs', () => {
      const payload: SlackPayload = {
        text: 'See details at https://example.com/issues/1,'
      };

      const result = transformSlackToMatrix(payload);

      expect(result.external_url).toBe('https://example.com/issues/1');
      expect(result.text).toContain('Upstream source: https://example.com/issues/1');
    });
  });

  describe('complex real-world scenarios', () => {
    it('should handle GitHub webhook format', () => {
      const payload: SlackPayload = {
        username: 'GitHub',
        attachments: [
          {
            color: 'good',
            title: 'New commit in repository',
            title_link: 'https://github.com/repo/commit/abc123',
            fields: [
              { title: 'Repository', value: 'user/repo', short: true },
              { title: 'Branch', value: 'main', short: true },
              { title: 'Author', value: 'John Doe', short: true },
              { title: 'Commit', value: 'abc123', short: true }
            ],
            text: 'Added new feature for authentication'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.username).toBe('GitHub');
      expect(result.text).toContain('🟢');
      expect(result.text).toContain('New commit in repository');
      expect(result.text).toContain('https://github.com/repo/commit/abc123');
      expect(result.text).toContain('Repository: user/repo');
      expect(result.text).toContain('Branch: main');
      expect(result.text).toContain('Added new feature for authentication');
    });

    it('should handle PagerDuty alert format', () => {
      const payload: SlackPayload = {
        username: 'PagerDuty',
        attachments: [
          {
            color: 'danger',
            title: 'CRITICAL - Service Down',
            fields: [
              { title: 'Incident', value: '#12345', short: true },
              { title: 'Service', value: 'api-production', short: true },
              { title: 'Status', value: 'Triggered', short: true }
            ],
            text: 'API health check failed for 5 minutes'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('🔴 CRITICAL - Service Down');
      expect(result.text).toContain('Incident: #12345');
      expect(result.text).toContain('Service: api-production');
      expect(result.text).toContain('API health check failed');
    });

    it('should handle Block Kit rich message', () => {
      const payload: SlackPayload = {
        username: 'NotificationBot',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Quarterly Report' }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Here are the key metrics for *Q4 2024*:'
            }
          },
          {
            type: 'section',
            fields: [
              { title: 'Revenue', value: '$1.2M', short: true },
              { title: 'Growth', value: '+15%', short: true },
              { title: 'Users', value: '45K', short: true },
              { title: 'Retention', value: '92%', short: true }
            ]
          },
          {
            type: 'divider'
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Generated by <https://dashboard.example.com|Analytics Dashboard>'
              }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.text).toContain('## Quarterly Report');
      expect(result.text).toContain('*Q4 2024*');
      expect(result.text).toContain('Revenue: $1.2M');
      expect(result.text).toContain('---');
      expect(result.text).toContain('Generated by');
      expect(result.username).toBe('NotificationBot');
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isValidBase64Url', () => {
  it('should validate standard Base64 encoded http URL', () => {
    const encoded = btoa('http://example.com/webhook');
    expect(isValidBase64Url(encoded)).toBe(true);
  });

  it('should validate standard Base64 encoded https URL', () => {
    const encoded = btoa('https://example.com/webhook');
    expect(isValidBase64Url(encoded)).toBe(true);
  });

  it('should validate URL-safe Base64 encoded URL', () => {
    // Create base64 and make it URL-safe
    const base64 = btoa('https://example.com/webhook');
    const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_');
    expect(isValidBase64Url(urlSafe)).toBe(true);
  });

  it('should reject non-Base64 strings', () => {
    expect(isValidBase64Url('not-base64!')).toBe(false);
    expect(isValidBase64Url('abc@#$')).toBe(false);
  });

  it('should reject strings that decode to non-HTTP URLs', () => {
    const ftpEncoded = btoa('ftp://example.com');
    expect(isValidBase64Url(ftpEncoded)).toBe(false);

    const fileEncoded = btoa('file:///etc/passwd');
    expect(isValidBase64Url(fileEncoded)).toBe(false);
  });

  it('should reject empty strings', () => {
    expect(isValidBase64Url('')).toBe(false);
  });

  it('should reject short strings (< 5 chars)', () => {
    expect(isValidBase64Url('abcd')).toBe(false);
  });

  it('should reject invalid Base64 characters', () => {
    expect(isValidBase64Url('invalid base64!')).toBe(false);
  });
});

describe('decodeMatrixUrl', () => {
  it('should decode standard Base64', () => {
    const encoded = btoa('https://matrix.example.com/webhook');
    const decoded = decodeMatrixUrl(encoded);
    expect(decoded).toBe('https://matrix.example.com/webhook');
  });

  it('should decode URL-safe Base64 with - and _', () => {
    const base64 = btoa('https://matrix.example.com/webhook');
    const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_');
    const decoded = decodeMatrixUrl(urlSafe);
    expect(decoded).toBe('https://matrix.example.com/webhook');
  });

  it('should handle URL-safe Base64 with padding', () => {
    // Create a string that will result in Base64 with padding
    const url = 'https://matrix.example.com/webhook';
    const base64 = btoa(url);
    const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_');
    const decoded = decodeMatrixUrl(urlSafe);
    expect(decoded).toBe(url);
  });

  it('should preserve encoded URL parameters', () => {
    const url = 'https://matrix.example.com/webhook?token=abc123&channel=!xyz';
    const encoded = btoa(url);
    const decoded = decodeMatrixUrl(encoded);
    expect(decoded).toBe(url);
  });
});
