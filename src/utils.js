/**
 * Utility functions for the Slack-to-Matrix transpiler
 */
/**
 * HTML Entity Escaping
 * Prevents XSS and ensures HTML is well-formed
 */
export function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string')
        return String(unsafe);
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/**
 * Regex Transpiler: Slack mrkdwn --> HTML
 * Handles Slack's proprietary markup syntax
 */
export function mrkdwnToHtml(text) {
    if (!text)
        return '';
    // 1. Escape HTML entities to prevent XSS and broken tags
    let t = escapeHtml(text);
    // 2. Links: <http://example.com|Label> or <http://example.com>
    // Note: We use &lt; and &gt; because we escaped them in step 1
    // Must be done before other transformations to avoid false positives
    t = t.replace(/&lt;([^|&gt;]+)\|([^&gt;]+)&gt;/g, '<a href="$1">$2</a>');
    t = t.replace(/&lt;([^|&gt;]+)&gt;/g, '<a href="$1">$1</a>');
    // 3. Bold: *text* (Logic: Must be at word boundary)
    // Prevents false positives with multiplication (e.g., 2*4)
    t = t.replace(/(^|\s)\*([^\*]+)\*($|\s)/g, '$1<b>$2</b>$3');
    // 4. Italic: _text_
    // Prevents false positives with snake_case_variable_names
    t = t.replace(/(^|\s)_([^_]+)_($|\s)/g, '$1<i>$2</i>$3');
    // 5. Strikethrough: ~text~
    t = t.replace(/~([^~]+)~/g, '<s>$1</s>');
    // 6. Code: `text`
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 7. Newlines to <br>
    t = t.replace(/\n/g, '<br>');
    return t;
}
