/**
 * Slack-to-Matrix Payload Transpiler
 *
 * Translates Slack Block Kit and legacy attachments into Matrix-safe text and HTML.
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
  fields?: (SlackField | SlackTextObject)[];
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
  enableDebugMetadata?: boolean;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  content?: {
    body?: string;
    formatted_body?: string;
    msgtype?: string;
    [key: string]: unknown;
  };
  event_id?: string;
  room_id?: string;
  sender?: string;
  origin_server_ts?: number;
}

export interface MatrixPayload {
  text: string;
  username?: string;
  msgtype?: 'm.notice' | 'm.text';
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
  external_url?: string;
}

interface TranspilerResult {
  text: string;
}

const WEBHOOK_DATA_KEY = 'uk.half-shot.hookshot.webhook_data';
const DEBUG_METADATA_TITLE = 'Debug metadata';

interface MetadataEntry {
  label: string;
  value: string;
  type?: 'url';
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
 * Extracts readable text from a section field, handling both formats:
 * - Block Kit: { type: "mrkdwn", text: "*project:*\ndev-ui" }
 * - Legacy:   { title: "project", value: "dev-ui" }
 */
function extractFieldText(field: SlackField | SlackTextObject): string | undefined {
  // Block Kit text object: has 'type' discriminant and 'text' content
  if ('type' in field && 'text' in field && !('value' in field)) {
    return field.text!
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\n/g, ' ')
      .trim();
  }

  // Legacy SlackField: has 'title' and 'value'
  if ('value' in field) {
    const f = field as SlackField;
    return f.title ? `${f.title}: ${f.value}` : f.value;
  }

  return undefined;
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
      const fieldText = extractFieldText(field);
      if (fieldText) {
        text += `- ${fieldText}\n`;
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
  if (
    lowerColor === 'danger' ||
    lowerColor.startsWith('#d00000') ||
    lowerColor.startsWith('#ff0000') ||
    lowerColor.startsWith('#f00')
  ) {
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
 * Slack links are normalized for Element readability while other mrkdwn is preserved.
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
  if (!text.trim()) {
    text = extractBestEffortText(payload);
  }

  const cleanedText = cleanupUndefinedArtifacts(text);
  const fallbackText = cleanedText.trim() || 'Received empty Slack payload';
  const sourceUrl = extractSourceUrl(payload, fallbackText);
  const messageText = normalizeMessageText(fallbackText).trim() || 'Received empty Slack payload';
  const metadata = collectMetadata(payload, sourceUrl, Boolean(payload.enableDebugMetadata));
  const fullText = appendMetadata(messageText, metadata);
  const formattedBody = renderHtml(messageText, metadata);

  return {
    text: fullText,
    msgtype: 'm.notice',
    format: 'org.matrix.custom.html',
    formatted_body: formattedBody,
    ...(sourceUrl && { external_url: sourceUrl }),
    ...(payload.username && { username: payload.username })
  };
}

function extractBestEffortText(payload: SlackPayload): string {
  if (payload.text) return payload.text;
  if (payload.content?.body) return payload.content.body;

  const hookshotData = payload.content?.[WEBHOOK_DATA_KEY];
  if (
    hookshotData &&
    typeof hookshotData === 'object' &&
    'text' in hookshotData &&
    typeof hookshotData.text === 'string'
  ) {
    return hookshotData.text;
  }

  return '';
}

function cleanupUndefinedArtifacts(input: string): string {
  return input
    .split('\n')
    .filter((line) => !/^\s*[-*]?\s*undefined\s*$/i.test(line))
    .join('\n')
    .trim();
}

function extractSourceUrl(payload: SlackPayload, text: string): string | undefined {
  const candidates = [getRawWebhookText(payload), text];

  for (const candidate of candidates) {
    const fromSlackStyleLink = candidate.match(/<(https?:\/\/[^|>\s]+)(?:\|[^>]+)?>/i)?.[1];
    const validSlackStyleLink = normalizeHttpUrl(fromSlackStyleLink);
    if (validSlackStyleLink) return validSlackStyleLink;

    const fromPlainUrl = candidate.match(/\bhttps?:\/\/[^\s<]+/i)?.[0];
    const validPlainUrl = normalizeHttpUrl(fromPlainUrl);
    if (validPlainUrl) return validPlainUrl;
  }

  const formattedBody = payload.content?.formatted_body;
  if (formattedBody) {
    const hrefMatch = formattedBody.match(/\bhref=(?:"([^"]+)"|'([^']+)')/i);
    const validHref = normalizeHttpUrl(hrefMatch?.[1] ?? hrefMatch?.[2]);
    if (validHref) return validHref;
  }

  return undefined;
}

function collectMetadata(
  payload: SlackPayload,
  sourceUrl: string | undefined,
  includeDebugIdentifiers: boolean
): MetadataEntry[] {
  const metadata: MetadataEntry[] = [];

  if (sourceUrl) {
    metadata.push({ label: 'Upstream source', value: sourceUrl, type: 'url' });
  }

  const timestamp = formatTimestamp(payload.origin_server_ts);
  if (timestamp) {
    metadata.push({ label: 'Timestamp', value: timestamp });
  }

  if (payload.content?.msgtype) {
    metadata.push({ label: 'Source msgtype', value: payload.content.msgtype });
  }

  if (includeDebugIdentifiers) {
    if (payload.event_id) metadata.push({ label: 'Event ID', value: payload.event_id });
    if (payload.room_id) metadata.push({ label: 'Room ID', value: payload.room_id });
    if (payload.sender) metadata.push({ label: 'Sender', value: payload.sender });
  }

  return metadata;
}

function appendMetadata(text: string, metadata: MetadataEntry[]): string {
  if (metadata.length === 0) return text;

  const lines = metadata.map(({ label, value }) => `${label}: ${value}`);
  return `${text}\n\n---\n${DEBUG_METADATA_TITLE}\n${lines.join('\n')}`;
}

function renderHtml(text: string, metadata: MetadataEntry[]): string {
  const body = renderLines(text);
  if (metadata.length === 0) return body;

  const metadataHtml = metadata
    .map((entry) => renderMetadataEntry(entry))
    .join('<br/>');

  return `${body}<hr/><strong>${DEBUG_METADATA_TITLE}</strong><br/>${metadataHtml}`;
}

function renderLines(text: string): string {
  return text
    .split('\n')
    .map((line) => renderLine(line))
    .join('<br/>');
}

function renderLine(line: string): string {
  const blockquoteCode = line.match(/^>\s*`([^`]+)`$/);
  if (blockquoteCode) {
    return `<blockquote><code>${escapeHtml(blockquoteCode[1])}</code></blockquote>`;
  }

  if (line === '---') {
    return '<hr/>';
  }

  return renderInlineHtml(line);
}

function renderMetadataEntry(entry: MetadataEntry): string {
  const label = `<strong>${escapeHtml(entry.label)}:</strong>`;
  const value =
    entry.type === 'url'
      ? renderUrl(entry.value, entry.value)
      : renderInlineHtml(entry.value);
  return `${label} ${value}`;
}

function renderInlineHtml(input: string): string {
  const urlPattern = /\bhttps?:\/\/[^\s<]+/gi;
  let output = '';
  let cursor = 0;

  for (const match of input.matchAll(urlPattern)) {
    const rawCandidate = match[0];
    const index = match.index ?? 0;
    const cleanUrl = trimTrailingUrlPunctuation(rawCandidate);
    const trailing = rawCandidate.slice(cleanUrl.length);
    const validUrl = normalizeHttpUrl(cleanUrl);

    output += escapeHtml(input.slice(cursor, index));
    output += validUrl
      ? `${renderUrl(validUrl, cleanUrl)}${escapeHtml(trailing)}`
      : escapeHtml(rawCandidate);
    cursor = index + rawCandidate.length;
  }

  output += escapeHtml(input.slice(cursor));
  return output;
}

function renderUrl(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

function normalizeMessageText(input: string): string {
  return input
    .replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_match, url: string, label: string) => {
      const normalizedLabel = label.trim() || normalizeHttpUrl(url) || '';
      if (/(error|exception|timeout|traceback)/i.test(normalizedLabel)) {
        return `> \`${normalizedLabel}\``;
      }
      return normalizedLabel;
    })
    .replace(/<(https?:\/\/[^>\s]+)>/g, (_match, url: string) => normalizeHttpUrl(url) ?? url);
}

function getRawWebhookText(payload: SlackPayload): string {
  if (payload.content?.body) return payload.content.body;

  const hookshotData = payload.content?.[WEBHOOK_DATA_KEY];
  if (
    hookshotData &&
    typeof hookshotData === 'object' &&
    'text' in hookshotData &&
    typeof hookshotData.text === 'string'
  ) {
    return hookshotData.text;
  }

  return payload.text ?? '';
}

function formatTimestamp(ts: number | undefined): string | undefined {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return undefined;

  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toISOString();
}

function normalizeHttpUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;

  const cleanUrl = trimTrailingUrlPunctuation(rawUrl.trim());
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return cleanUrl;
  } catch {
    return undefined;
  }
}

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,;)\]>"']+$/g, '');
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
