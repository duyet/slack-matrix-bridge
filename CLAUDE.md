# Slack-Matrix Bridge - Developer Documentation

Developer documentation for Claude Code AI assistant working on this project.

## Project Overview

A serverless Slack-to-Matrix webhook bridge running on Cloudflare Workers. The core innovation is the **State-in-URL** architectural pattern: the destination Matrix webhook URL is Base64-encoded in the request path, eliminating any need for databases, configuration files, or server-side state.

### Key Concepts

- **Stateless Architecture**: No database, KV store, or persistent configuration
- **State-in-URL Pattern**: Destination encoded in URL path as Base64
- **Fake Slack Behavior**: Returns "ok" to keep upstream integrations healthy
- **Hono Framework**: Lightweight web framework for clean routing
- **V8 Isolates**: Near-instant cold starts on Cloudflare Workers

## Architecture

### Directory Structure

```
slack-matrix-bridge/
├── src/
│   ├── index.ts          # Main entry point, routes, webhook handler
│   ├── transpiler.ts     # Slack → Matrix payload transformation
│   ├── ui.tsx            # Home page HTML renderer
│   ├── index.test.ts     # Integration tests
│   └── transpiler.test.ts# Transpiler unit tests
├── tests/                # Additional test fixtures
├── package.json          # Dependencies and scripts
├── wrangler.toml         # Cloudflare Workers configuration
├── tsconfig.json         # TypeScript configuration
└── vitest.config.ts      # Test runner configuration
```

### File Purposes

#### `src/index.ts`

Main application entry point using Hono framework.

**Routes:**
- `GET /` - Serves HTML page with URL generator form
- `POST /*` - Webhook endpoint that processes Slack payloads

**Key Functions:**
- Webhook handler (lines 335-454): Main request flow with validation, transformation, and forwarding

**Request Flow:**
1. Validate POST method
2. Extract Base64-encoded Matrix URL from path
3. Validate Base64 format
4. Decode and validate protocol (SSRF protection)
5. Parse JSON payload
6. Transform via `transformSlackToMatrix()`
7. Forward to Matrix Hookshot
8. Return appropriate response ("ok" or error)

#### `src/transpiler.ts`

Core transformation logic converting Slack payloads to Matrix format.

**Key Functions:**
- `transformSlackToMatrix(payload: SlackPayload): MatrixPayload` - Main entry point
- `parseBlock(block: SlackBlock): TranspilerResult` - Block Kit parser
- `parseAttachment(attachment: SlackAttachment): TranspilerResult` - Legacy attachments parser
- `renderHtml(text: string): string` - Plain text and links to Matrix-safe HTML
- `escapeHtml(unsafe: string): string` - XSS prevention
- `isValidBase64Url(encoded: string): boolean` - Base64 validation
- `decodeMatrixUrl(encodedPath: string): string` - URL-safe Base64 decode

**Type Definitions:**
- `SlackPayload` - Input schema with blocks, attachments, text
- `MatrixPayload` - Output schema with text, html, username
- `SlackBlock` - Block Kit block types (section, header, context, divider, image)
- `SlackAttachment` - Legacy attachment format
- `SlackField`, `SlackTextObject` - Supporting types

**Transformation Strategy:**
1. Parse Block Kit if present (modern)
2. Parse Attachments if present (legacy)
3. Fallback to top-level text if needed
4. Always generate both HTML and plain text versions

## Key Functions Reference

### Transformation Pipeline

```typescript
// Main entry point - handles all payload types
transformSlackToMatrix(payload: SlackPayload): MatrixPayload

// Block Kit parsers
parseSectionBlock(block: SlackBlock): TranspilerResult
parseHeaderBlock(block: SlackBlock): TranspilerResult
parseContextBlock(block: SlackBlock): TranspilerResult
parseImageBlock(block: SlackBlock): TranspilerResult

// Legacy attachment parser
parseAttachment(attachment: SlackAttachment): TranspilerResult
mapColorToIcon(color?: string): string

// Format conversion
renderHtml(text: string): string
escapeHtml(unsafe: string): string
```

### URL Utilities

```typescript
// Validates Base64 format and decodes to verify http/s protocol
isValidBase64Url(encoded: string): boolean

// Decodes URL-safe Base64 to original Matrix URL
decodeMatrixUrl(encodedPath: string): string
```

## Package Manager

**Bun** is used as the package manager and runtime for this project. All `npm run` commands are executed via `bun run`.

```bash
# Install dependencies
bun install

# Run any npm script
bun run <script>
```

## Development Commands

```bash
# Local development with hot reload
bun run dev

# Deploy to Cloudflare Workers
bun run deploy

# View real-time logs from production
bun run tail

# Type checking without emitting files
bun run typecheck

# Run tests in watch mode
bun test

# Run tests once
bun run test:run

# Run tests with coverage report
bun run test:coverage
```

## Automation Workflow Commands

Use these commands for code-smell and dead-code automation runs:

```bash
# 0) Use writable local cache/temp dirs in sandboxed environments
mkdir -p .bun-tmp .bun-cache
export BUN_TMPDIR="$PWD/.bun-tmp"
export BUN_INSTALL_CACHE_DIR="$PWD/.bun-cache"

# 1) Find commit scope since last automation run (or last 7 days fallback)
git log --since="<ISO-8601 timestamp>" --name-only --pretty=format:'%h %ad %s' --date=iso
# Fallback when no saved timestamp is available
git log --since="24 hours ago" --name-only --pretty=format:'%h %ad %s' --date=iso

# 2) Prove dead code with zero references (exclude tests)
rg -n "<symbol_name>" src --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/__tests__/**' --glob '!tests/**'

# 3) Verify before PR
bun audit
XDG_CONFIG_HOME=$PWD/.tmp/xdg WRANGLER_HOME=$PWD/.tmp/wrangler TMPDIR=$PWD/.tmp bun run test:run
bun run typecheck

# 4) PR + review loop
gh pr create --fill
gh pr comment --body "@codex review"
gh pr checks --watch

# 5) Verify merge commit CI on main
gh run list --branch main --commit "<merge_sha>" --json databaseId,name,status,conclusion,url
```

## Core Maintenance Memory

Keep durable automation notes in [`docs/knowledge/core-memory.md`](./docs/knowledge/core-memory.md) and keep it listed in [`docs/INDEX.md`](./docs/INDEX.md). Do not create dated code-smell/dead-code report files.

## Testing Strategy

### Test Files

- `src/index.test.ts` - Integration tests for webhook handler
- `src/transpiler.test.ts` - Unit tests for transpiler functions

### Testing Patterns

**Unit Tests (transpiler.test.ts):**
- Test each Block Kit block type independently
- Test attachment parsing with various color mappings
- Test mrkdwn-to-HTML conversion edge cases
- Test URL encoding/decoding

**Integration Tests (index.test.ts):**
- Test full request flow from POST to Matrix
- Test error responses (400, 404, 502)
- Test "Fake Slack" response behavior
- Test SSRF protection

### Running Tests

```bash
# Watch mode for development
bun test

# Single run for CI/CD
bun run test:run

# With coverage
bun run test:coverage
```

## Important Implementation Details

### Word Boundary Protection

The mrkdwn parser uses word boundaries to avoid false positives:

```typescript
// Prevents "2 * 4 = 8" from becoming "2 <b>4</b> = 8"
/(^|[\s])\*([^*]+)\*($|[\s])/g

// Prevents "snake_case" from becoming "snake<i>case</i>"
/(^|[\s])_([^_]+)_($|[\s])/g
```

### Link Parsing Order

Links must be parsed BEFORE other formatting to avoid conflicts:

1. Escape HTML entities (XSS prevention)
2. Parse links: `<URL|Text>` and `<URL>`
3. Parse bold, italic, strikethrough
4. Parse code
5. Convert newlines

### Color Mapping

Semantic colors map to emoji for Matrix compatibility:

```typescript
'danger' | '#d00000' | '#ff...' → 🔴
'good' | '#36a64f' | '#0f0...' → 🟢
'warning' | '#ff...' | '#fc0...' → ⚠️
other → 🔵
```

### URL-Safe Base64

The bridge supports both standard and URL-safe Base64:

```typescript
// URL-safe uses - and _ instead of + and /
const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
```

### SSRF Protection

Only http/https protocols allowed:

```typescript
if (!matrixWebhookUrl.startsWith('http://') &&
    !matrixWebhookUrl.startsWith('https://')) {
  return 400;
}
```

## Error Handling

### Response Codes

- **200** - Success with "ok" body (Fake Slack behavior)
- **400** - Invalid request (missing URL, invalid Base64, invalid JSON)
- **405** - Method not allowed (non-POST requests)
- **404** - Matrix webhook not found (forwarded from Hookshot)
- **502** - Network error reaching Matrix Hookshot

### Error Messages

Error messages are descriptive for debugging but don't expose internal details:

```typescript
// User-friendly
"Error: Invalid Base64 encoded destination URL."

// Debug-friendly
"Upstream Matrix Error: 404 Not Found"
"Bridge Error: Failed to connect to Matrix destination. ..."
```

## Dependencies

### Runtime
- **hono** (4.6.12) - Lightweight web framework for routing

### DevDependencies
- **@cloudflare/vitest-pool-workers** - Worker-specific test environment
- **@cloudflare/workers-types** - TypeScript definitions for Workers API
- **typescript** - Type checking
- **vitest** - Test runner
- **wrangler** - Cloudflare Workers CLI

## Performance Considerations

### CPU Time Limits

Free tier: 10ms per request

**Optimizations:**
- Regex patterns avoid catastrophic backtracking
- Single-pass string transformations
- No async operations except final fetch()

### URL Length

Cloudflare limit: ~16-32KB per URL path

**Typical usage:**
- Matrix Hookshot URL: ~100-200 characters
- Base64 encoded: ~130-270 characters
- Well within limits

### Cold Starts

V8 Isolates enable 0ms cold starts vs ~500ms for container-based Lambda.

## Code Style

- **TypeScript strict mode** enabled
- **ESLint**: Not yet configured, consider adding
- **Prettier**: Not yet configured, consider adding
- **Import style**: ES modules (`import`/`export`)
- **Function naming**: camelCase for functions, PascalCase for types/interfaces

## Future Improvements

### Potential Enhancements

1. **Add rate limiting** to prevent abuse
2. **Add request metrics** for monitoring
3. **Add webhook domain restriction** for security
4. **Add ESLint/Prettier** for consistent formatting
5. **Add E2E tests** with real Hookshot instance
6. **Add OpenAPI spec** for webhook endpoint
7. **Add CI/CD pipeline** for automated testing/deployment

### Known Limitations

- **User mentions** (`<@U123>`) display as raw IDs (stateless system)
- **Channel mentions** (`<#C123>`) display as raw IDs
- **Interactive elements** (buttons, selects) are silently dropped
- **Complex tables** from attachments flatten to lists

## Troubleshooting Development Issues

### Wrangler Commands Not Working

```bash
# Reinstall wrangler globally
bun uninstall -g wrangler
bun install -g wrangler

# Or use bunx to avoid global install
bunx wrangler deploy
```

### Type Errors After `bun install`

```bash
# Regenerate type definitions
bun run typecheck

# Clear cache and reinstall
rm -rf node_modules bun.lockb
bun install
```

### Tests Failing Locally

```bash
# Ensure test environment is clean and writable in sandbox
mkdir -p .bun-tmp .bun-cache
BUN_TMPDIR="$PWD/.bun-tmp" BUN_INSTALL_CACHE_DIR="$PWD/.bun-cache" bun run test:run

# Check if specific test is failing
bun test transpiler.test.ts
```

## Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Hono Framework](https://hono.dev/)
- [Slack Block Kit](https://api.slack.com/block-kit)
- [Matrix Hookshot](https://github.com/matrix-org/matrix-hookshot)
- [Base64 URL-Safe Encoding](https://en.wikipedia.org/wiki/Base64#URL_applications)
