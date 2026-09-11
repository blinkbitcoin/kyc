// The HTML sinks' helpers, tested directly (the page tests cover them only
// through rendered output).

import { escapeHtml, jsonForScript, sanitizeId } from '../html';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('leaves everything else untouched', () => {
    expect(escapeHtml('Ada Applicant 2026-09-10 10:44 ü')).toBe(
      'Ada Applicant 2026-09-10 10:44 ü',
    );
    expect(escapeHtml('')).toBe('');
  });
});

describe('sanitizeId', () => {
  it.each([
    'abc-123',
    'A',
    'a'.repeat(64),
    'session_1',
    '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b',
  ])('passes the well-formed id %j through', id => {
    expect(sanitizeId(id)).toBe(id);
  });

  it.each([
    undefined,
    '',
    'a'.repeat(65),
    'has space',
    'semi;colon',
    '<img src=x onerror=alert(1)>',
    '../x',
  ])('returns null for %j, which is not an opaque identifier', id => {
    expect(sanitizeId(id)).toBeNull();
  });
});

describe('jsonForScript', () => {
  it('is JSON with every < escaped so </script> can never appear', () => {
    const out = jsonForScript('</script><script>alert(1)</script>');
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toBe('</script><script>alert(1)</script>');
  });

  it('escapes the line terminators that are legal in JSON but not in a script', () => {
    const out = jsonForScript('a\u2028b\u2029c');
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(out).toContain('\\u2028');
    expect(JSON.parse(out)).toBe('a\u2028b\u2029c');
  });

  it('keeps plain values as JSON.stringify would', () => {
    expect(jsonForScript('approved')).toBe('"approved"');
    expect(jsonForScript({ a: 1, b: [true, null] })).toBe(
      '{"a":1,"b":[true,null]}',
    );
  });
});
