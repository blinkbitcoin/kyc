import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SOURCE,
} from '@blinkbitcoin/kyc-core/hosted';
import { BRIDGE_SCRIPT } from '../bridge/script';
import {
  BRIDGE_PROTOCOL_VERSION as SERVER_VERSION,
  BRIDGE_SOURCE as SERVER_SOURCE,
  DEFAULT_PERMISSIONS_POLICY,
  hostedPageCsp,
  hostedPageNonce,
  PAGE_STYLE,
  renderNotFoundPage,
} from '../pages';

const NONCE = 'test-nonce';

describe('bridge protocol constants', () => {
  it('match the published @blinkbitcoin/kyc-core protocol', () => {
    expect(SERVER_SOURCE).toBe(BRIDGE_SOURCE);
    expect(SERVER_VERSION).toBe(BRIDGE_PROTOCOL_VERSION);
  });
});

describe('hostedPageNonce', () => {
  it('is fresh, base64 and long enough', () => {
    const a = hostedPageNonce();
    const b = hostedPageNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(a, 'base64')).toHaveLength(16);
  });
});

describe('hostedPageCsp', () => {
  it('locks a page down to its own nonce', () => {
    const csp = hostedPageCsp(NONCE);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`script-src 'nonce-${NONCE}'`);
    expect(csp).toContain(`style-src 'nonce-${NONCE}'`);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain('frame-ancestors *');
  });

  it('lets a provider add the sources and directives its SDK needs', () => {
    const csp = hostedPageCsp(NONCE, {
      scriptSrc: ['https://cdn.example'],
      connectSrc: ['https://api.example', 'https://*.example'],
      extra: ['frame-src https://x'],
    });
    expect(csp).toContain(`script-src 'nonce-${NONCE}' https://cdn.example; `);
    expect(csp).toContain(
      'connect-src https://api.example https://*.example; frame-src https://x; style-src',
    );
    expect(csp).not.toContain("'self'");
  });
});

describe('DEFAULT_PERMISSIONS_POLICY', () => {
  it('grants camera and microphone to the page itself only', () => {
    expect(DEFAULT_PERMISSIONS_POLICY).toBe('camera=(self), microphone=(self)');
  });
});

describe('renderNotFoundPage', () => {
  it('emits a sessionExpired envelope so a waiting host stops spinning', () => {
    const html = renderNotFoundPage(NONCE);
    expect(html).toContain(`<script nonce="${NONCE}">${BRIDGE_SCRIPT}`);
    expect(html).toContain("window.__kycBridge.post('sessionExpired')");
    expect(html).toContain(`<style nonce="${NONCE}">${PAGE_STYLE}</style>`);
    expect(html).toContain('no longer available');
  });
});
