/**
 * Slack-to-Matrix Payload Transpiler
 *
 * Translates Slack Block Kit, legacy attachments, and mrkdwn formatting
 * into Matrix-compatible HTML and plain text.
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface SlackTextObject {
  type: 'mrkdwn' | 'plain_text';
  text: string;
  emoji?: boolean;
  verbatim?: boolean;
}

interface SlackField {
  title?: string;
  value: string;
  short?: boolean;
}

interface SlackBlock {
  type: string;
  text?: SlackTextObject;
  fields?: SlackField[];
  elements?: SlackTextObject[];
  image_url?: string;
  alt_text?: string;
}

interface SlackAttachment {
  color?: string;
  pretext?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: SlackField[];
  ts?: number;
}

export interface SlackPayload {
  text?: string;
  username?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface MatrixPayload {
  version: 'v2';
  plain: string;
  html?: string;
  markdown?: string;
  msgtype?: string;
}

interface TranspilerResult {
  html: string;
  plain: string;
  markdown: string;
}

// ============================================================================
// HTML Escape Utility
// ============================================================================

/**
 * Escapes HTML entities to prevent XSS attacks.
 * Must be called BEFORE mrkdwn parsing to avoid double-escaping.
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// Mrkdwn to HTML Transpiler
// ============================================================================

/**
 * Transpiles Slack's proprietary mrkdwn format to Matrix-compatible HTML.
 *
 * Transformation order is critical:
 * 1. Escape HTML entities (XSS prevention)
 * 2. Links: <URL|Text> or <URL>
 * 3. Bold: *text* (with word boundary protection)
 * 4. Italic: _text_ (with word boundary protection)
 * 5. Strikethrough: ~text~
 * 6. Code: `text`
 * 7. Newlines: <br>
 */
export function mrkdwnToHtml(mrkdwn: string): string {
  if (!mrkdwn || typeof mrkdwn !== 'string') return '';

  // Step 1: Escape HTML entities first
  let html = escapeHtml(mrkdwn);

  // Step 1.5: Handle backslash escapes from tools like BugSink
  // Remove backslashes before * and _ that were added for safe transport
  html = html.replace(/\\\*/g, '*').replace(/\\_/g, '_');

  // Step 2: Links with optional text: <URL|Label> or <URL>
  // Negative lookahead prevents matching special tokens like <!here>, <@U123>
  html = html.replace(
    /<(?![!@#])([^&>\|]+)\|([^&>]+)>/g,
    '<a href="$1">$2</a>'
  );
  html = html.replace(
    /<(?![!@#])([^&>\|]+)>/g,
    '<a href="$1">$1</a>'
  );

  // Step 3: Bold: *text* (must be at word boundaries)
  // Word boundary check prevents false positives in "2 * 4 = 8"
  html = html.replace(
    /(^|[\s])\*([^*]+)\*($|[\s])/g,
    '$1<b>$2</b>$3'
  );

  // Step 4: Italic: _text_ (must be at word boundaries)
  // Prevents false positives in snake_case_variable_names
  html = html.replace(
    /(^|[\s])_([^_]+)_($|[\s])/g,
    '$1<i>$2</i>$3'
  );

  // Step 5: Strikethrough: ~text~
  html = html.replace(/~([^~]+)~/g, '<s>$1</s>');

  // Step 6: Inline code: `text`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Step 7: Convert newlines to <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

// ============================================================================
// Mrkdwn to Markdown Transpiler
// ============================================================================

/**
 * Transpiles Slack's proprietary mrkdwn format to standard markdown.
 *
 * Produces clean markdown for debugging/logging purposes.
 * Note: Matrix still uses HTML for rendering, but markdown is useful for:
 * - Debugging/development
 * - Future-proofing if Hookshot adds markdown support
 * - Logs and analytics
 *
 * Transformation order:
 * 1. Links: <URL|Text> → [Text](URL), <URL> → <URL>
 * 2. Remove backslash escapes: \* → *, \_ → _
 * 3. Keep bold, italic, strikethrough, code as-is (standard markdown)
 * 4. Remove stray word boundary artifacts from HTML conversion
 */
export function mrkdwnToMarkdown(mrkdwn: string): string {
  if (!mrkdwn || typeof mrkdwn !== 'string') return '';

  let md = mrkdwn;

  // Step 1: Remove backslash escapes (reverse of what we do for HTML)
  md = md.replace(/\\\*/g, '*').replace(/\\_/g, '_');

  // Step 2: Links with optional text: <URL|Label> → [Label](URL)
  // Negative lookahead prevents matching special tokens like <!here>, <@U123>
  md = md.replace(/<(?![!@#])([^&>\|]+)\|([^&>]+)>/g, '[$2]($1)');
  // Bare URLs: <URL> → <URL> (standard markdown for autolinks)
  md = md.replace(/<(?![!@#])([^&>\|]+)>/g, '<$1>');

  // Step 3: Bold, italic, strikethrough, code are already standard markdown
  // *text* → bold
  // _text_ → italic
  // ~text~ → strikethrough
  // `text` → code
  // No conversion needed!

  return md;
}

// ============================================================================
// Block Kit Parser
// ============================================================================

/**
 * Parses Slack Block Kit blocks into HTML and plain text.
 * Handles: section, header, context, divider, image blocks.
 */
function parseBlock(block: SlackBlock): TranspilerResult {
  const result: TranspilerResult = { html: '', plain: '', markdown: '' };

  switch (block.type) {
    case 'section':
      return parseSectionBlock(block);

    case 'header':
      return parseHeaderBlock(block);

    case 'context':
      return parseContextBlock(block);

    case 'divider':
      return { html: '<hr>', plain: '---', markdown: '---' };

    case 'image':
      return parseImageBlock(block);

    default:
      // Unknown block types are ignored
      return result;
  }
}

/**
 * Parses section blocks with optional text and fields.
 */
function parseSectionBlock(block: SlackBlock): TranspilerResult {
  const result: TranspilerResult = { html: '', plain: '', markdown: '' };

  // Section text content
  if (block.text?.text) {
    result.html += `<p>${mrkdwnToHtml(block.text.text)}</p>`;
    result.plain += block.text.text + '\n';
    result.markdown += mrkdwnToMarkdown(block.text.text) + '\n\n';
  }

  // Section fields (displayed as columns in Slack, as list in Matrix)
  if (block.fields && Array.isArray(block.fields)) {
    result.html += '<ul>';
    for (const field of block.fields) {
      const fieldHtml = mrkdwnToHtml(field.value || '');
      result.html += `<li>${fieldHtml}</li>`;
      result.plain += `- ${field.value}\n`;
      result.markdown += `- ${mrkdwnToMarkdown(field.value || '')}\n`;
    }
    result.html += '</ul>';
    result.markdown += '\n';
  }

  return result;
}

/**
 * Parses header blocks (large bold text).
 */
function parseHeaderBlock(block: SlackBlock): TranspilerResult {
  if (block.text?.text) {
    return {
      html: `<h3>${escapeHtml(block.text.text)}</h3>`,
      plain: `## ${block.text.text}\n`,
      markdown: `## ${block.text.text}\n\n`
    };
  }
  return { html: '', plain: '', markdown: '' };
}

/**
 * Parses context blocks (metadata in small gray text).
 */
function parseContextBlock(block: SlackBlock): TranspilerResult {
  const result: TranspilerResult = { html: '<br><small>', plain: '', markdown: '' };

  if (block.elements && Array.isArray(block.elements)) {
    for (const element of block.elements) {
      if (element.text) {
        result.html += mrkdwnToHtml(element.text) + ' ';
        result.plain += element.text + ' ';
        result.markdown += element.text + ' ';
      }
    }
  }

  result.html += '</small>';
  result.markdown += '\n\n';
  return result;
}

/**
 * Parses image blocks.
 */
function parseImageBlock(block: SlackBlock): TranspilerResult {
  if (block.image_url) {
    const altText = block.alt_text || 'Image';
    return {
      html: `<img src="${block.image_url}" alt="${escapeHtml(altText)}" /><br>`,
      plain: `[Image: ${altText}]\n`,
      markdown: `![${altText}](${block.image_url})\n\n`
    };
  }
  return { html: '', plain: '', markdown: '' };
}

// ============================================================================
// Legacy Attachments Parser
// ============================================================================

/**
 * Maps Slack attachment colors to emoji indicators.
 */
function mapColorToIcon(color?: string): string {
  if (!color) return '';

  const lowerColor = color.toLowerCase();

  // 🔴 Danger / Error indicators
  if (lowerColor === 'danger' || lowerColor.startsWith('#d00000') || lowerColor.startsWith('#ff')) {
    return '🔴 ';
  }

  // 🟢 Success / Good indicators
  if (lowerColor === 'good' || lowerColor.startsWith('#36a64f') || lowerColor.startsWith('#0f0')) {
    return '🟢 ';
  }

  // ⚠️ Warning indicators
  if (lowerColor === 'warning' || lowerColor.startsWith('#ff') || lowerColor.startsWith('#fc0')) {
    return '⚠️ ';
  }

  // 🔵 Default / Info indicator
  return '🔵 ';
}

/**
 * Parses legacy Slack attachments into HTML and plain text.
 * Handles color mapping, field flattening, and title links.
 */
function parseAttachment(attachment: SlackAttachment): TranspilerResult {
  const result: TranspilerResult = { html: '', plain: '', markdown: '' };

  // Map color to emoji indicator
  const icon = mapColorToIcon(attachment.color);

  // Pretext (text above the attachment)
  if (attachment.pretext) {
    result.html += `<p>${mrkdwnToHtml(attachment.pretext)}</p>`;
    result.plain += attachment.pretext + '\n';
    result.markdown += mrkdwnToMarkdown(attachment.pretext) + '\n\n';
  }

  // Title with optional link
  if (attachment.title) {
    let titleHtml: string;
    if (attachment.title_link) {
      titleHtml = `<a href="${attachment.title_link}">${escapeHtml(attachment.title)}</a>`;
    } else {
      titleHtml = escapeHtml(attachment.title);
    }
    result.html += `<h4>${icon}${titleHtml}</h4>`;
    result.plain += `${icon}${attachment.title}\n`;
    if (attachment.title_link) {
      result.markdown += `${icon}[${attachment.title}](${attachment.title_link})\n\n`;
    } else {
      result.markdown += `${icon}${attachment.title}\n\n`;
    }
  }

  // Main text content
  if (attachment.text) {
    result.html += `<p>${mrkdwnToHtml(attachment.text)}</p>`;
    result.plain += attachment.text + '\n';
    result.markdown += mrkdwnToMarkdown(attachment.text) + '\n\n';
  }

  // Fields (flattened from grid layout to list)
  if (attachment.fields && Array.isArray(attachment.fields)) {
    result.html += '<ul>';
    for (const field of attachment.fields) {
      const title = field.title ? `<b>${escapeHtml(field.title)}:</b> ` : '';
      result.html += `<li>${title}${mrkdwnToHtml(field.value)}</li>`;
      result.plain += `${field.title || ''}: ${field.value}\n`;
      const mdTitle = field.title ? `**${field.title}**: ` : '';
      result.markdown += `- ${mdTitle}${mrkdwnToMarkdown(field.value)}\n`;
    }
    result.html += '</ul>';
    result.markdown += '\n';
  }

  return result;
}

// ============================================================================
// Main Transpiler Entry Point
// ============================================================================

/**
 * Transforms a Slack webhook payload into a Matrix-compatible payload.
 *
 * Strategy:
 * 1. If "blocks" exist, parse them (Modern Block Kit)
 * 2. If "attachments" exist, parse them (Legacy format)
 * 3. If "text" exists, use it as fallback (Simple messages)
 *
 * Returns both HTML and plain text versions for Matrix compatibility.
 */
export function transformSlackToMatrix(payload: SlackPayload): MatrixPayload {
  let html = '';
  let plain = '';
  let markdown = '';

  // Priority 1: Modern Block Kit
  if (payload.blocks && Array.isArray(payload.blocks) && payload.blocks.length > 0) {
    for (const block of payload.blocks) {
      const parsed = parseBlock(block);
      html += parsed.html;
      plain += parsed.plain;
      markdown += parsed.markdown;
    }
  }

  // Priority 2: Legacy Attachments
  if (payload.attachments && Array.isArray(payload.attachments) && payload.attachments.length > 0) {
    for (const attachment of payload.attachments) {
      const parsed = parseAttachment(attachment);
      html += parsed.html;
      plain += parsed.plain;
      markdown += parsed.markdown;
    }
  }

  // Priority 3: Fallback to top-level text
  // Only used if blocks/attachments didn't produce any content
  if (!html && !plain && payload.text) {
    html = mrkdwnToHtml(payload.text);
    plain = payload.text;
    markdown = mrkdwnToMarkdown(payload.text);
  }

  // Ensure we always have fallback text
  const fallbackText = plain.trim() || 'Received empty Slack payload';

  return {
    version: 'v2',
    plain: fallbackText,
    html: html.trim() || undefined,
    markdown: markdown.trim() || undefined,
    msgtype: 'm.notice'
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates if a string is a valid Base64 encoded URL.
 */
export function isValidBase64Url(encoded: string): boolean {
  if (!encoded || encoded.length < 5) return false;

  try {
    // Replace URL-safe characters with standard Base64
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);

    // Verify it decodes to a valid HTTP(S) URL
    return decoded.startsWith('http://') || decoded.startsWith('https://');
  } catch {
    return false;
  }
}

/**
 * Decodes a Base64 encoded Matrix webhook URL.
 * Supports both standard and URL-safe Base64 variants.
 */
export function decodeMatrixUrl(encodedPath: string): string {
  // Replace URL-safe chars with standard Base64 chars
  const base64 = encodedPath.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}
