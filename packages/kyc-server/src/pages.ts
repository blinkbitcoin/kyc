// The hosted verification page's neutral layer: the parameters every
// provider page gets, the shared stylesheet, the page a host serves when the
// session cannot be shown, and the security headers a page ships under.
// The pages themselves are the providers' (providers/*/page.ts): a provider's
// web SDK wrapped in the kyc-bridge protocol, which the client packages'
// interpretBridgeMessage reads.

import { randomBytes } from 'node:crypto';
import { BRIDGE_SCRIPT } from './bridge/script';

export { BRIDGE_PROTOCOL_VERSION, BRIDGE_SOURCE } from './bridge/script';

/** What a provider's page renderer gets for one session. */
export interface HostedPageParams {
  sessionId: string;
  /** The host's user id (a mock page signs webhooks on its behalf; never rendered). */
  userId: string;
  accessToken: string;
  locale?: string;
  applicantId?: string;
  /** The CSP nonce the host generated for this response. */
  nonce: string;
}

/** A fresh CSP nonce for one response. */
export const hostedPageNonce = (): string => randomBytes(16).toString('base64');

export interface HostedPageCspOptions {
  /** Script origins beyond the nonce (a provider's SDK loader). */
  scriptSrc?: readonly string[];
  /** connect-src sources; `'self'` unless the provider's SDK talks elsewhere. */
  connectSrc?: readonly string[];
  /** Further directives (frame-src, img-src, media-src ...). */
  extra?: readonly string[];
}

/**
 * The CSP a page gets, with what its provider asks for. `frame-ancestors *`
 * is deliberate: the page exists to be embedded in a host app's WebView or
 * iframe, and the postMessage origin pin on the client side is what actually
 * authenticates the channel.
 */
export const hostedPageCsp = (
  nonce: string,
  options: HostedPageCspOptions = {},
): string =>
  [
    "default-src 'none'",
    [`script-src 'nonce-${nonce}'`, ...(options.scriptSrc ?? [])].join(' '),
    `connect-src ${(options.connectSrc ?? ["'self'"]).join(' ')}`,
    ...(options.extra ?? []),
    `style-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
    'frame-ancestors *',
  ].join('; ');

/** Camera and microphone for the page itself, unless its provider asks for more. */
export const DEFAULT_PERMISSIONS_POLICY = 'camera=(self), microphone=(self)';

export const PAGE_STYLE = `
    body { font-family: system-ui, sans-serif; margin: 0; padding: 0; color: #222; background: #fff; }
    .wrap { padding: 24px; max-width: 480px; margin: 0 auto; text-align: center; }
    h1 { font-size: 18px; }
    .meta { color: #666; font-size: 13px; word-break: break-all; }
    button { display: block; width: 100%; margin: 8px 0; padding: 14px; font-size: 16px; border-radius: 8px; border: none; cursor: pointer; }
    .primary { background: #007aff; color: #fff; font-weight: 600; }
    .plain { background: #eee; color: #333; }`;

/** The page a host serves for a session it cannot show; tells the app to stop waiting. */
export const renderNotFoundPage = (nonce: string): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Verification Unavailable</title>
  <style nonce="${nonce}">${PAGE_STYLE}</style>
</head>
<body>
  <div class="wrap">
    <h1>This verification session is no longer available</h1>
    <p class="meta">Return to the app and start again.</p>
  </div>
  <script nonce="${nonce}">${BRIDGE_SCRIPT}
    window.__kycBridge.post('sessionExpired');
  </script>
</body>
</html>
`;
