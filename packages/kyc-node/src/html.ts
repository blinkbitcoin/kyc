// Escaping and sanitization for values interpolated into the HTML pages the
// hosted-page layer serves (pages.ts and the providers' pages). Three sinks,
// one helper each:
//   - HTML text / attribute values → escapeHtml
//   - identifiers echoed into markup → sanitizeId (allow-list, never escape)
//   - JSON embedded in a <script> block → jsonForScript

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Escape text for interpolation into HTML content or a double/single-quoted
// attribute value
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

/** An opaque identifier, or null when the value is missing or not one. */
export const sanitizeId = (value: string | undefined): string | null =>
  value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : null;

/**
 * JSON safe to inline in a <script> block. Escapes `<` (so a value can never
 * close the script tag) and U+2028/U+2029, which are valid in JSON strings
 * but are line terminators in a script body.
 */
export const jsonForScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
