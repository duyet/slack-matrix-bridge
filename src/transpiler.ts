/**
 * Slack-to-Matrix Payload Transpiler
 *
 * Translates Slack Block Kit and legacy attachments into Matrix-safe text and HTML.
 * Emits both Hookshot (`html`) and Matrix (`formatted_body`) HTML fields.
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

interface SlackAccessory {
  type?: string;
  image_url?: string;
  alt_text?: string;
  text?: SlackTextObject;
  url?: string;
  value?: string;
}

interface SlackBlock {
  type: string;
  text?: SlackTextObject;
  fields?: (SlackField | SlackTextObject)[];
  elements?: Array<SlackTextObject & { image_url?: string; alt_text?: string }>;
  image_url?: string;
  alt_text?: string;
  accessory?: SlackAccessory;
  title?: SlackTextObject;
}

interface SlackAttachment {
  color?: string;
  fallback?: string;
  pretext?: string;
  author_name?: string;
  author_link?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: SlackField[];
  footer?: string;
  ts?: number | string;
  image_url?: string;
  thumb_url?: string;
}

export interface SlackPayload {
  text?: string;
  username?: string;
  icon_url?: string;
  icon_emoji?: string;
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
  project?: string;
  environment?: string;
  env?: string;
  server?: string;
  service?: string;
  release?: string;
  host?: string;
  hostname?: string;
  logger?: string;
  [key: string]: unknown;
}

export interface MatrixPayload {
  text: string;
  html?: string;
  username?: string;
  avatarUrl?: string;
  msgtype?: 'm.notice' | 'm.text';
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
  external_url?: string;
}

interface FieldItem {
  label?: string;
  value: string;
}

interface TranspilerResult {
  text: string;
  fields?: FieldItem[];
}

const WEBHOOK_DATA_KEY = 'uk.half-shot.hookshot.webhook_data';
const DEBUG_METADATA_TITLE = 'Debug metadata';

const CONTEXT_KEYS = [
  'project',
  'environment',
  'env',
  'server',
  'service',
  'release',
  'host',
  'hostname',
  'logger',
  'site',
  'team',
  'level',
  'severity',
  'culprit',
] as const;

interface MetadataEntry {
  label: string;
  value: string;
  type?: 'url';
}

// ============================================================================
// Block Kit Parser
// ============================================================================

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
      return { text: '' };
  }
}

function extractField(field: SlackField | SlackTextObject): FieldItem | undefined {
  if ('type' in field && 'text' in field && !('value' in field)) {
    return parseLabeledMrkdwn(field.text ?? '');
  }

  if ('value' in field) {
    const f = field as SlackField;
    return f.title ? { label: f.title, value: String(f.value ?? '') } : { value: String(f.value ?? '') };
  }

  return undefined;
}

function parseLabeledMrkdwn(raw: string): FieldItem | undefined {
  const text = raw.trim();
  if (!text) return undefined;

  const labeled = text.match(/^\*?([^*\n:]+):?\*?\s*(?:\n+|:\s*)([\s\S]+)$/);
  if (labeled) {
    return {
      label: labeled[1].trim(),
      value: labeled[2].replace(/\n/g, ' ').trim()
    };
  }

  return { value: text.replace(/\n/g, ' ').trim() };
}

function formatFieldLine(field: FieldItem): string {
  return field.label ? `- ${field.label}: ${field.value}` : `- ${field.value}`;
}

function parseSectionBlock(block: SlackBlock): TranspilerResult {
  let text = '';
  const fields: FieldItem[] = [];

  if (block.text?.text) {
    const sectionText = dropSuppressedLinks(block.text.text);
    if (sectionText.trim()) {
      text += sectionText + '\n';
    }
  }

  if (block.fields && Array.isArray(block.fields)) {
    for (const field of block.fields) {
      const parsed = extractField(field);
      if (parsed) {
        fields.push(parsed);
        text += `${formatFieldLine(parsed)}\n`;
      }
    }
    text += '\n';
  }

  if (block.accessory) {
    const accessoryText = parseAccessory(block.accessory);
    if (accessoryText) text += accessoryText + '\n';
  }

  return { text, fields };
}

function parseAccessory(accessory: SlackAccessory): string {
  if (accessory.url) {
    const label = accessory.text?.text || accessory.value || 'Open';
    return `<${accessory.url}|${label}>`;
  }
  if (accessory.image_url) {
    const alt = accessory.alt_text || 'Image';
    return `[Image: ${alt}](${accessory.image_url})`;
  }
  return '';
}

function parseHeaderBlock(block: SlackBlock): TranspilerResult {
  if (block.text?.text) {
    return { text: `## ${block.text.text}\n\n` };
  }
  return { text: '' };
}

function parseContextBlock(block: SlackBlock): TranspilerResult {
  const parts: string[] = [];

  if (block.elements && Array.isArray(block.elements)) {
    for (const element of block.elements) {
      if (element.text) parts.push(element.text);
      else if (element.image_url) parts.push(`[Image: ${element.alt_text || 'Image'}](${element.image_url})`);
    }
  }

  return { text: parts.join(' ') + '\n\n' };
}

function parseImageBlock(block: SlackBlock): TranspilerResult {
  const imageUrl = block.image_url;
  if (imageUrl) {
    const altText = block.alt_text || block.title?.text || 'Image';
    return { text: `[Image: ${altText}](${imageUrl})\n\n` };
  }
  return { text: '' };
}

// ============================================================================
// Legacy Attachments Parser
// ============================================================================

function mapColorToIcon(color?: string): string {
  if (!color) return '';

  const lowerColor = color.toLowerCase();

  if (
    lowerColor === 'danger' ||
    lowerColor.startsWith('#d00000') ||
    lowerColor.startsWith('#ff0000') ||
    lowerColor.startsWith('#f00')
  ) {
    return '🔴 ';
  }

  if (lowerColor === 'good' || lowerColor.startsWith('#36a64f') || lowerColor.startsWith('#0f0')) {
    return '🟢 ';
  }

  if (lowerColor === 'warning' || lowerColor.startsWith('#ff') || lowerColor.startsWith('#fc0')) {
    return '⚠️ ';
  }

  return '🔵 ';
}

function parseAttachment(attachment: SlackAttachment): TranspilerResult {
  let text = '';
  const fields: FieldItem[] = [];
  const icon = mapColorToIcon(attachment.color);

  if (attachment.pretext) {
    text += attachment.pretext + '\n';
  }

  if (attachment.author_name) {
    if (attachment.author_link) {
      text += `From <${attachment.author_link}|${attachment.author_name}>\n`;
    } else {
      text += `From ${attachment.author_name}\n`;
    }
  }

  if (attachment.title) {
    if (attachment.title_link) {
      text += `${icon}<${attachment.title_link}|${attachment.title}>\n\n`;
    } else {
      text += `${icon}${attachment.title}\n\n`;
    }
  } else if (icon) {
    text += icon.trim() + '\n';
  }

  if (attachment.text) {
    text += attachment.text + '\n';
  } else if (!attachment.title && attachment.fallback) {
    text += attachment.fallback + '\n';
  }

  if (attachment.fields && Array.isArray(attachment.fields)) {
    for (const field of attachment.fields) {
      const parsed = extractField(field);
      if (parsed) {
        fields.push(parsed);
        text += `${formatFieldLine(parsed)}\n`;
      }
    }
    text += '\n';
  }

  if (attachment.image_url) {
    text += `[Image](${attachment.image_url})\n`;
  } else if (attachment.thumb_url) {
    text += `[Image](${attachment.thumb_url})\n`;
  }

  if (attachment.footer) {
    text += `_${attachment.footer}_\n`;
  }

  const ts = formatAttachmentTimestamp(attachment.ts);
  if (ts) {
    text += `${ts}\n`;
  }

  return { text, fields };
}

function formatAttachmentTimestamp(ts: number | string | undefined): string | undefined {
  if (ts === undefined || ts === null) return undefined;
  const numeric = typeof ts === 'string' ? Number(ts) : ts;
  if (!Number.isFinite(numeric)) return String(ts);
  const millis = numeric < 1e12 ? numeric * 1000 : numeric;
  return formatTimestamp(millis);
}

// ============================================================================
// Main Transpiler Entry Point
// ============================================================================

export function transformSlackToMatrix(payload: SlackPayload): MatrixPayload {
  let text = '';
  const collectedFields: FieldItem[] = [];

  if (payload.blocks && Array.isArray(payload.blocks) && payload.blocks.length > 0) {
    for (const block of payload.blocks) {
      const parsed = parseBlock(block);
      text += parsed.text;
      if (parsed.fields) collectedFields.push(...parsed.fields);
    }
  }

  if (payload.attachments && Array.isArray(payload.attachments) && payload.attachments.length > 0) {
    for (const attachment of payload.attachments) {
      const parsed = parseAttachment(attachment);
      text += parsed.text;
      if (parsed.fields) collectedFields.push(...parsed.fields);
    }
  }

  if (!text.trim()) {
    text = extractBestEffortText(payload);
  }

  text = dropSuppressedLinks(text);

  const extraFields = collectContextFields(payload, collectedFields, text);
  if (extraFields.length > 0) {
    const extraLines = extraFields.map(formatFieldLine).join('\n');
    text = `${text.trim()}\n${extraLines}\n`;
    collectedFields.push(...extraFields);
  }

  const cleanedText = cleanupUndefinedArtifacts(text);
  const fallbackText = cleanedText.trim() || 'Received empty Slack payload';
  const sourceUrl = extractSourceUrl(payload, fallbackText);
  const messageText = normalizeMessageText(fallbackText).trim() || 'Received empty Slack payload';

  let bodyText = messageText;
  if (sourceUrl && !bodyContainsUrl(messageText, sourceUrl)) {
    bodyText = `${messageText}\n- Source: ${sourceUrl}`;
  }

  const metadata = payload.enableDebugMetadata
    ? collectDebugMetadata(payload, sourceUrl)
    : [];
  const fullText = appendMetadata(bodyText, metadata);
  const formattedBody = renderHtml(bodyText, metadata);

  return {
    text: fullText,
    html: formattedBody,
    msgtype: 'm.notice',
    format: 'org.matrix.custom.html',
    formatted_body: formattedBody,
    ...(sourceUrl && { external_url: sourceUrl }),
    ...(payload.username && { username: payload.username }),
    ...(typeof payload.icon_url === 'string' && payload.icon_url && { avatarUrl: payload.icon_url })
  };
}

function collectContextFields(
  payload: SlackPayload,
  existing: FieldItem[],
  text: string
): FieldItem[] {
  const seen = new Set(
    existing
      .map((f) => f.label?.toLowerCase())
      .filter((label): label is string => Boolean(label))
  );

  const extras: FieldItem[] = [];
  const haystack = text.toLowerCase();

  for (const key of CONTEXT_KEYS) {
    const raw = payload[key];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    if (seen.has(key)) continue;
    if (haystack.includes(`${key}:`) || haystack.includes(`*${key}*`)) continue;
    extras.push({ label: key, value: raw.trim() });
    seen.add(key);
  }

  return extras;
}

function bodyContainsUrl(text: string, url: string): boolean {
  return text.includes(url);
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

function isSuppressedLinkLabel(label: string): boolean {
  return /^view on bugsink$/i.test(label.trim());
}

function dropSuppressedLinks(input: string): string {
  return input
    .replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (match, _url: string, label: string) =>
      isSuppressedLinkLabel(label) ? '' : match
    )
    .replace(/\[[^\]]*view on bugsink[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractSourceUrl(payload: SlackPayload, text: string): string | undefined {
  const titleLinks = (payload.attachments ?? [])
    .map((a) => a.title_link)
    .filter((url): url is string => Boolean(url));

  const candidates = [
    ...titleLinks,
    dropSuppressedLinks(getRawWebhookText(payload)),
    dropSuppressedLinks(text),
  ];

  for (const candidate of candidates) {
    const fromSlackStyleLink = candidate.match(/<(https?:\/\/[^|>\s]+)(?:\|[^>]+)?>/i)?.[1];
    const validSlackStyleLink = normalizeHttpUrl(fromSlackStyleLink);
    if (validSlackStyleLink) return validSlackStyleLink;

    const fromMarkdownLink = candidate.match(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/i)?.[1];
    const validMarkdownLink = normalizeHttpUrl(fromMarkdownLink);
    if (validMarkdownLink) return validMarkdownLink;

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

function collectDebugMetadata(
  payload: SlackPayload,
  sourceUrl: string | undefined
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

  if (payload.event_id) metadata.push({ label: 'Event ID', value: payload.event_id });
  if (payload.room_id) metadata.push({ label: 'Room ID', value: payload.room_id });
  if (payload.sender) metadata.push({ label: 'Sender', value: payload.sender });

  return metadata;
}

function appendMetadata(text: string, metadata: MetadataEntry[]): string {
  if (metadata.length === 0) return text;

  const lines = metadata.map(({ label, value }) => `${label}: ${value}`);
  return `${text}\n\n---\n${DEBUG_METADATA_TITLE}\n${lines.join('\n')}`;
}

function renderHtml(text: string, metadata: MetadataEntry[]): string {
  const body = renderBlocks(text);
  if (metadata.length === 0) return body;

  const metadataHtml = metadata
    .map((entry) => renderMetadataEntry(entry))
    .join('<br/>');

  return `${body}<hr/><strong>${DEBUG_METADATA_TITLE}</strong><br/>${metadataHtml}`;
}

function renderBlocks(text: string): string {
  const lines = text.split('\n');
  const html: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    html.push(`<ul>${listBuffer.join('')}</ul>`);
    listBuffer = [];
  };

  for (const line of lines) {
    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      listBuffer.push(`<li>${renderFieldOrInline(listMatch[1])}</li>`);
      continue;
    }

    flushList();

    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      html.push(`<h3>${renderInlineHtml(heading[1])}</h3>`);
      continue;
    }

    const blockquoteCode = line.match(/^>\s*`([^`]+)`$/);
    if (blockquoteCode) {
      html.push(`<blockquote><code>${escapeHtml(blockquoteCode[1])}</code></blockquote>`);
      continue;
    }

    const blockquote = line.match(/^>\s+(.+)$/);
    if (blockquote) {
      html.push(`<blockquote>${renderInlineHtml(blockquote[1])}</blockquote>`);
      continue;
    }

    if (line === '---') {
      html.push('<hr/>');
      continue;
    }

    if (line.trim() === '') {
      continue;
    }

    html.push(`<p>${renderInlineHtml(line)}</p>`);
  }

  flushList();
  return html.join('');
}

function renderFieldOrInline(line: string): string {
  const labeled = line.match(/^([^:]{1,40}):\s+(.+)$/);
  if (labeled) {
    return `<strong>${escapeHtml(labeled[1])}:</strong> ${renderInlineHtml(labeled[2])}`;
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
  const links: Array<{ url: string; label: string }> = [];
  const stashLink = (url: string, label: string): string => {
    const key = `%%L${links.length}%%`;
    links.push({ url, label });
    return key;
  };

  let output = input;

  output = output.replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_m, url: string, label: string) => {
    const valid = normalizeHttpUrl(url);
    return valid ? stashLink(valid, label) : `${label} ${url}`;
  });

  output = output.replace(/<(https?:\/\/[^>\s]+)>/g, (_m, url: string) => {
    const valid = normalizeHttpUrl(url);
    return valid ? stashLink(valid, valid) : url;
  });

  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) => {
    const valid = normalizeHttpUrl(url);
    return valid ? stashLink(valid, label) : `${label} ${url}`;
  });

  output = output.replace(/\bhttps?:\/\/[^\s<]+/gi, (raw) => {
    const cleanUrl = trimTrailingUrlPunctuation(raw);
    const validUrl = normalizeHttpUrl(cleanUrl);
    return validUrl ? stashLink(validUrl, cleanUrl) : raw;
  });

  output = applyMrkdwn(output);

  links.forEach((link, i) => {
    output = output.replace(`%%L${i}%%`, renderUrl(link.url, link.label || link.url));
  });

  return output;
}

function applyMrkdwn(input: string): string {
  const tokens: string[] = [];
  const stash = (html: string): string => {
    const key = `%%TOK${tokens.length}%%`;
    tokens.push(html);
    return key;
  };

  let output = input.replace(/`([^`]+)`/g, (_m, code: string) => {
    return stash(`<code>${escapeHtml(code)}</code>`);
  });

  output = output.replace(/(^|[\s(])\*([^*\n]+)\*($|[\s).,])/g, (_m, pre: string, inner: string, post: string) => {
    return `${pre}${stash(`<strong>${escapeHtml(inner)}</strong>`)}${post}`;
  });

  output = output.replace(/(^|[\s(])_([^_\n]+)_($|[\s).,])/g, (_m, pre: string, inner: string, post: string) => {
    return `${pre}${stash(`<em>${escapeHtml(inner)}</em>`)}${post}`;
  });

  output = output.replace(/(^|[\s(])~([^~\n]+)~($|[\s).,])/g, (_m, pre: string, inner: string, post: string) => {
    return `${pre}${stash(`<del>${escapeHtml(inner)}</del>`)}${post}`;
  });

  output = escapeHtml(output);

  tokens.forEach((html, i) => {
    output = output.replace(`%%TOK${i}%%`, html);
  });

  return output;
}

function renderUrl(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

function normalizeMessageText(input: string): string {
  return input
    .replace(/<(https?:\/\/[^|>\s]+)\|([^>]+)>/g, (_match, url: string, label: string) => {
      const normalizedLabel = label.trim() || normalizeHttpUrl(url) || '';
      if (isSuppressedLinkLabel(normalizedLabel)) return '';
      const validUrl = normalizeHttpUrl(url);
      if (/(error|exception|timeout|traceback)/i.test(normalizedLabel)) {
        return validUrl ? `> \`${normalizedLabel}\`\n${validUrl}` : `> \`${normalizedLabel}\``;
      }
      return validUrl ? `[${normalizedLabel}](${validUrl})` : normalizedLabel;
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

export function isValidBase64Url(encoded: string): boolean {
  if (!encoded || encoded.length < 5) return false;

  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    return decoded.startsWith('http://') || decoded.startsWith('https://');
  } catch {
    return false;
  }
}

export function decodeMatrixUrl(encodedPath: string): string {
  const base64 = encodedPath.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}
