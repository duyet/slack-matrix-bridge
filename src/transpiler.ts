/**
 * Slack-to-Matrix Payload Transpiler
 *
 * Translates Slack Block Kit and legacy attachments into plain text.
 * Raw mrkdwn formatting is passed through for Matrix Hookshot to render.
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
  text: string;
  username?: string;
}

interface TranspilerResult {
  text: string;
}

// ============================================================================
// Block Kit Parser
// ============================================================================

/**
 * Parses Slack Block Kit blocks into plain text.
 * Handles: section, header, context, divider, image blocks.
 */
function parseBlock(block: SlackBlock): TranspilerResult {
  switch (block.type) {
    case 'section':
      return parseSectionBlock(block);
    case 'header':
      return parseHeaderBlock(block);
    case 'context':
      return parseContextBlock(block);
    case 'divider':
      return { text: '---\n' };
    case 'image':
      return parseImageBlock(block);
    default:
      // Unknown block types are ignored
      return { text: '' };
  }
}

/**
 * Parses section blocks with optional text and fields.
 */
function parseSectionBlock(block: SlackBlock): TranspilerResult {
  let text = '';

  // Section text content
  if (block.text?.text) {
    text += block.text.text + '\n';
  }

  // Section fields (displayed as columns in Slack, as list in Matrix)
  if (block.fields && Array.isArray(block.fields)) {
    for (const field of block.fields) {
      if (field.title) {
        text += `- ${field.title}: ${field.value}\n`;
      } else {
        text += `- ${field.value}\n`;
      }
    }
    text += '\n';
  }

  return { text };
}

/**
 * Parses header blocks (large bold text).
 */
function parseHeaderBlock(block: SlackBlock): TranspilerResult {
  if (block.text?.text) {
    return { text: `## ${block.text.text}\n\n` };
  }
  return { text: '' };
}

/**
 * Parses context blocks (metadata in small gray text).
 */
function parseContextBlock(block: SlackBlock): TranspilerResult {
  let text = '';

  if (block.elements && Array.isArray(block.elements)) {
    for (const element of block.elements) {
      if (element.text) {
        text += element.text + ' ';
      }
    }
  }

  return { text: text.trim() + '\n\n' };
}

/**
 * Parses image blocks.
 */
function parseImageBlock(block: SlackBlock): TranspilerResult {
  if (block.image_url) {
    const altText = block.alt_text || 'Image';
    return {
      text: `[Image: ${altText}](${block.image_url})\n\n`
    };
  }
  return { text: '' };
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
 * Parses legacy Slack attachments into plain text.
 * Handles color mapping, field flattening, and title links.
 */
function parseAttachment(attachment: SlackAttachment): TranspilerResult {
  let text = '';

  // Map color to emoji indicator
  const icon = mapColorToIcon(attachment.color);

  // Pretext (text above the attachment)
  if (attachment.pretext) {
    text += attachment.pretext + '\n';
  }

  // Title with optional link
  if (attachment.title) {
    if (attachment.title_link) {
      text += `${icon}<${attachment.title_link}|${attachment.title}>\n\n`;
    } else {
      text += `${icon}${attachment.title}\n\n`;
    }
  }

  // Main text content
  if (attachment.text) {
    text += attachment.text + '\n';
  }

  // Fields (flattened from grid layout to list)
  if (attachment.fields && Array.isArray(attachment.fields)) {
    for (const field of attachment.fields) {
      if (field.title) {
        text += `- ${field.title}: ${field.value}\n`;
      } else {
        text += `- ${field.value}\n`;
      }
    }
    text += '\n';
  }

  return { text };
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
 * Raw mrkdwn is passed through for Matrix Hookshot to render natively.
 */
export function transformSlackToMatrix(payload: SlackPayload): MatrixPayload {
  let text = '';

  // Priority 1: Modern Block Kit
  if (payload.blocks && Array.isArray(payload.blocks) && payload.blocks.length > 0) {
    for (const block of payload.blocks) {
      const parsed = parseBlock(block);
      text += parsed.text;
    }
  }

  // Priority 2: Legacy Attachments
  if (payload.attachments && Array.isArray(payload.attachments) && payload.attachments.length > 0) {
    for (const attachment of payload.attachments) {
      const parsed = parseAttachment(attachment);
      text += parsed.text;
    }
  }

  // Priority 3: Fallback to top-level text
  // Only used if blocks/attachments didn't produce any content
  if (!text.trim() && payload.text) {
    text = payload.text;
  }

  // Ensure we always have fallback text
  const fallbackText = text.trim() || 'Received empty Slack payload';

  return {
    text: fallbackText,
    ...(payload.username && { username: payload.username })
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
