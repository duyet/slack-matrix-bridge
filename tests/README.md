# Testing Guide

## Test Infrastructure

The Slack-to-Matrix Bridge uses Vitest with the Cloudflare Workers testing pool for comprehensive unit and integration testing.

### Test Files

- **`src/transpiler.test.ts`** - Tests for the Slack-to-Matrix transpiler
  - HTML escaping (XSS prevention)
  - Mrkdwn to HTML conversion
  - Block Kit parsing (section, header, context, divider, image)
  - Legacy attachment parsing
  - End-to-end transformation
  - Base64 URL utilities

- **`src/index.test.ts`** - Tests for the Cloudflare Workers handler
  - HTTP method validation (405 for non-POST)
  - Base64 URL validation (400 for invalid Base64)
  - Protocol validation (SSRF prevention - 400 for non-HTTP)
  - Payload parsing (400 for invalid JSON)
  - Successful webhook forwarding (returns "ok")
  - Matrix error forwarding
  - Network error handling
  - Integration tests

## Running Tests

```bash
# Install dependencies
bun install

# Run tests in watch mode
bun test

# Run tests once
bun run test:run

# Run tests with coverage report
bun run test:coverage

# Run tests for a specific file
bunx vitest run src/transpiler.test.ts

# Run tests matching a pattern
bunx vitest run -t "escapeHtml"
```

## Test Coverage

The test suite aims for comprehensive coverage of:

- All utility functions (escapeHtml, mrkdwnToHtml, Base64 utilities)
- Block Kit block types (section, header, context, divider, image)
- Legacy attachment parsing (colors, fields, title links)
- Error handling (invalid input, network failures, upstream errors)
- Security scenarios (XSS prevention, SSRF prevention)

## Writing New Tests

When adding new features:

1. Write unit tests for utility functions in `transpiler.test.ts`
2. Write integration tests for worker behavior in `index.test.ts`
3. Test both success and error paths
4. Include security-focused tests for user input
5. Test edge cases (empty strings, malformed input, special characters)

### Example Test Structure

```typescript
describe('Feature name', () => {
  it('should do X', () => {
    // Arrange
    const input = { ... };

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });

  it('should handle error case', () => {
    expect(() => functionUnderTest(invalid)).toThrow();
  });
});
```

## CI/CD Integration

Tests run automatically:
- On every pull request
- Before deployment to production
- As part of the release process

The `test:run` script is used in CI for faster execution without watch mode.
