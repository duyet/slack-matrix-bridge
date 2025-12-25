/**
 * Comprehensive tests for Slack-to-Matrix transpiler
 *
 * Tests cover:
 * - HTML escaping (XSS prevention)
 * - Mrkdwn to HTML conversion
 * - Block Kit parsing (section, header, context, divider, image)
 * - Legacy attachment parsing
 * - End-to-end transformation
 */

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  mrkdwnToHtml,
  transformSlackToMatrix,
  isValidBase64Url,
  decodeMatrixUrl,
  type SlackPayload,
} from './transpiler';

// ============================================================================
// HTML Escape Tests (XSS Prevention)
// ============================================================================

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape less than signs', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('should escape greater than signs', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('should escape mixed special characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
    );
  });

  it('should escape all entities in sequence', () => {
    expect(escapeHtml('<a href="test">Tom & Jerry</a>')).toBe(
      '&lt;a href=&quot;test&quot;&gt;Tom &amp; Jerry&lt;/a&gt;'
    );
  });

  it('should handle empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should return empty string for non-string input', () => {
    expect(escapeHtml(undefined as unknown as string)).toBe('');
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(123 as unknown as string)).toBe('');
  });

  it('should handle strings without special characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('should escape ampersand before other entities', () => {
    // Tests that & doesn't get double-escaped
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

// ============================================================================
// Mrkdwn to HTML Tests
// ============================================================================

describe('mrkdwnToHtml', () => {
  describe('bold formatting', () => {
    it('should convert asterisk-wrapped text to bold', () => {
      expect(mrkdwnToHtml('*bold text*')).toBe('<b>bold text</b>');
    });

    it('should require word boundaries for bold', () => {
      expect(mrkdwnToHtml('2 * 4 = 8')).toBe('2 * 4 = 8');
    });

    it('should handle bold at start of string', () => {
      expect(mrkdwnToHtml('*bold* text')).toBe('<b>bold</b> text');
    });

    it('should handle bold at end of string', () => {
      expect(mrkdwnToHtml('text *bold*')).toBe('text <b>bold</b>');
    });

    it('should handle bold in middle of string', () => {
      expect(mrkdwnToHtml('some *bold* text')).toBe('some <b>bold</b> text');
    });

    it('should not convert single asterisk', () => {
      expect(mrkdwnToHtml('not * bold')).toBe('not * bold');
    });
  });

  describe('italic formatting', () => {
    it('should convert underscore-wrapped text to italic', () => {
      expect(mrkdwnToHtml('_italic text_')).toBe('<i>italic text</i>');
    });

    it('should require word boundaries for italic', () => {
      expect(mrkdwnToHtml('snake_case_variable')).toBe('snake_case_variable');
    });

    it('should handle italic at start of string', () => {
      expect(mrkdwnToHtml('_italic_ text')).toBe('<i>italic</i> text');
    });

    it('should handle italic at end of string', () => {
      expect(mrkdwnToHtml('text _italic_')).toBe('text <i>italic</i>');
    });

    it('should not convert single underscore', () => {
      expect(mrkdwnToHtml('not _ italic')).toBe('not _ italic');
    });
  });

  describe('link formatting', () => {
    it('should convert links with labels', () => {
      expect(mrkdwnToHtml('<https://example.com|Example>')).toBe(
        '<a href="https://example.com">Example</a>'
      );
    });

    it('should convert bare links', () => {
      expect(mrkdwnToHtml('<https://example.com>')).toBe(
        '<a href="https://example.com">https://example.com</a>'
      );
    });

    it('should not convert special Slack tokens', () => {
      expect(mrkdwnToHtml('<!here>')).toBe('&lt;!here&gt;');
      expect(mrkdwnToHtml('<@U123>')).toBe('&lt;@U123&gt;');
      expect(mrkdwnToHtml('<#C123>')).toBe('&lt;#C123&gt;');
    });

    it('should handle links with special characters', () => {
      expect(mrkdwnToHtml('<https://example.com/path?query=value&foo=bar|Link>')).toBe(
        '<a href="https://example.com/path?query=value&amp;foo=bar">Link</a>'
      );
    });
  });

  describe('code formatting', () => {
    it('should convert backtick-wrapped text to code', () => {
      expect(mrkdwnToHtml('`code`')).toBe('<code>code</code>');
    });

    it('should handle multiple code segments', () => {
      expect(mrkdwnToHtml('`foo` and `bar`')).toBe('<code>foo</code> and <code>bar</code>');
    });

    it('should preserve HTML entities in code', () => {
      expect(mrkdwnToHtml('<div>')).toBe('&lt;div&gt;');
    });
  });

  describe('strikethrough formatting', () => {
    it('should convert tilde-wrapped text to strikethrough', () => {
      expect(mrkdwnToHtml('~deleted~')).toBe('<s>deleted</s>');
    });

    it('should handle multiple strikethrough segments', () => {
      expect(mrkdwnToHtml('~old~ and ~gone~')).toBe('<s>old</s> and <s>gone</s>');
    });
  });

  describe('newline handling', () => {
    it('should convert newlines to br tags', () => {
      expect(mrkdwnToHtml('line 1\nline 2')).toBe('line 1<br>line 2');
    });

    it('should handle multiple consecutive newlines', () => {
      expect(mrkdwnToHtml('line 1\n\nline 2')).toBe('line 1<br><br>line 2');
    });
  });

  describe('combined formatting', () => {
    it('should handle bold and italic together', () => {
      expect(mrkdwnToHtml('*bold* and _italic_')).toBe('<b>bold</b> and <i>italic</i>');
    });

    it('should handle links with formatting', () => {
      expect(mrkdwnToHtml('<https://example.com|*Click here*>')).toBe(
        '<a href="https://example.com">*Click here*</a>'
      );
    });

    it('should handle complex mixed formatting', () => {
      expect(mrkdwnToHtml('*Bold* with `code` and <https://example.com|link>')).toBe(
        '<b>Bold</b> with <code>code</code> and <a href="https://example.com">link</a>'
      );
    });
  });

  describe('edge cases', () => {
    it('should return empty string for undefined', () => {
      expect(mrkdwnToHtml(undefined as unknown as string)).toBe('');
    });

    it('should return empty string for null', () => {
      expect(mrkdwnToHtml(null as unknown as string)).toBe('');
    });

    it('should handle empty string', () => {
      expect(mrkdwnToHtml('')).toBe('');
    });

    it('should escape HTML before formatting', () => {
      expect(mrkdwnToHtml('<script>*xss*</script>')).toBe(
        '&lt;script&gt;<b>xss</b>&lt;/script&gt;'
      );
    });
  });
});

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

      expect(result.html).toContain('<p>Section text</p>');
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

      expect(result.html).toContain('<ul>');
      expect(result.html).toContain('<li><b>Value 1</b></li>');
      expect(result.html).toContain('<li><b>Value 2</b></li>');
      expect(result.html).toContain('</ul>');
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

      expect(result.html).toContain('<p><b>Header</b></p>');
      expect(result.html).toContain('<ul>');
      expect(result.html).toContain('<li><b>Field value</b></li>');
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

      expect(result.html).toContain('<h3>Important Header</h3>');
      expect(result.text).toContain('## Important Header');
    });

    it('should escape HTML in header text', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '<script>alert(1)</script>' }
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
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

      expect(result.html).toContain('<br><small>');
      expect(result.html).toContain('</small>');
      expect(result.text).toContain('Metadata More info');
    });

    it('should handle context block with formatting', () => {
      const payload: SlackPayload = {
        blocks: [
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: '*Bold* context' }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.html).toContain('<b>Bold</b>');
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

      expect(result.html).toContain('<hr>');
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

      expect(result.html).toContain('<img src="https://example.com/image.png"');
      expect(result.html).toContain('alt="Example image"');
      expect(result.html).toContain('<br>');
      expect(result.text).toContain('[Image: Example image]');
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

      expect(result.html).toContain('alt="Image"');
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

      expect(result.html).not.toContain('Should be ignored');
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

      expect(result.html).toContain('<h3>Title</h3>');
      expect(result.html).toContain('<p>Content</p>');
      expect(result.html).toContain('<hr>');
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
      expect(result.html).toContain('🔴');
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

      expect(result.html).toContain('<p>Pre-text appears above</p>');
      expect(result.html).toContain('<h4>');
      expect(result.html).toContain('href="https://example.com"');
      expect(result.html).toContain('Attachment Title</a>');
      expect(result.html).toContain('<p>Main content goes here</p>');
      expect(result.html).toContain('<ul>');
      expect(result.html).toContain('<li><b>Field 1:</b> Value 1</li>');
      expect(result.html).toContain('<li><b>Field 2:</b> Value 2</li>');

      expect(result.text).toContain('Pre-text appears above');
      expect(result.text).toContain('Attachment Title');
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

      expect(result.html).toContain('<h4>Plain title</h4>');
      expect(result.html).not.toContain('<a href');
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

      expect(result.html).toContain('<li><b>Status:</b> Active</li>');
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

      expect(result.html).toContain('<li>Just a value</li>');
      expect(result.text).toContain(': Just a value');
    });
  });

  describe('mrkdwn in attachments', () => {
    it('should parse mrkdwn in attachment text', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            text: '*Bold* and `code` in attachment'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.html).toContain('<b>Bold</b>');
      expect(result.html).toContain('<code>code</code>');
    });

    it('should parse mrkdwn in attachment fields', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            fields: [
              { value: '*Important* value' }
            ]
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.html).toContain('<b>Important</b>');
    });

    it('should parse mrkdwn in attachment pretext', () => {
      const payload: SlackPayload = {
        attachments: [
          {
            pretext: '<https://example.com|Link text>'
          }
        ]
      };

      const result = transformSlackToMatrix(payload);

      expect(result.html).toContain('<a href="https://example.com">Link text</a>');
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

      expect(result.html).toContain('🟢 First attachment');
      expect(result.html).toContain('🔴 Second attachment');
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

      expect(result.html).toContain('Block content');
      expect(result.html).toContain('Attachment content');
      expect(result.text).toContain('Block content');
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

      expect(result.html).toContain('Attachment content');
      expect(result.text).toContain('Attachment content');
      expect(result.text).not.toContain('Fallback text');
    });

    it('should use text as fallback when no blocks or attachments', () => {
      const payload: SlackPayload = {
        text: 'Simple message'
      };

      const result = transformSlackToMatrix(payload);

      expect(result.html).toContain('Simple message');
      expect(result.text).toBe('Simple message');
    });

    it('should use fallback when payload is empty', () => {
      const payload: SlackPayload = {};

      const result = transformSlackToMatrix(payload);

      expect(result.text).toBe('Received empty Slack payload');
      expect(result.html).toBeUndefined();
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

    it('should use default username when not specified', () => {
      const payload: SlackPayload = {
        text: 'Message'
      };

      const result = transformSlackToMatrix(payload);

      expect(result.username).toBe('SlackBridge');
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
      expect(result.html).toContain('🟢');
      expect(result.html).toContain('href="https://github.com/repo/commit/abc123"');
      expect(result.html).toContain('Repository:</b> user/repo');
      expect(result.html).toContain('Branch:</b> main');
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

      expect(result.html).toContain('🔴 CRITICAL - Service Down');
      expect(result.html).toContain('<b>Incident:</b> #12345');
      expect(result.html).toContain('<b>Service:</b> api-production');
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

      expect(result.html).toContain('<h3>Quarterly Report</h3>');
      expect(result.html).toContain('<b>Q4 2024</b>');
      expect(result.html).toContain('<li><b>Revenue</b></li>');
      expect(result.html).toContain('$1.2M');
      expect(result.html).toContain('<hr>');
      expect(result.html).toContain('<small>');
      expect(result.html).toContain('href="https://dashboard.example.com"');
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
