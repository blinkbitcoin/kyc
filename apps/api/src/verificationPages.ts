// The hosted verification page: a provider's web SDK wrapped in the
// kyc-bridge protocol. Template and escaping discipline come from esign's
// apps/api/src/signingPages.ts; the protocol is the one
// @blinkbitcoin/kyc-core's interpretBridgeMessage reads.
//
// apps/api does not depend on kyc-core, so BRIDGE_SOURCE and
// BRIDGE_PROTOCOL_VERSION are duplicated here and pinned by
// tests/verificationPages.test.ts. Likewise SUMSUB_STATUS_FN is the browser
// twin of providers/sumsub/mapping.ts's mapSumsubStatus, and a test runs
// both over the same table. PHASE 4 replaces both duplicates with imports
// from @blinkbitcoin/kyc-sumsub / @blinkbitcoin/kyc-core.

export const BRIDGE_SOURCE = 'kyc-bridge';
export const BRIDGE_PROTOCOL_VERSION = 1;

export const SUMSUB_SDK_URL = 'https://static.sumsub.com/idensic/static/sns-websdk-builder.js';

/** Camera and microphone for the page itself and for Sumsub's own frames. */
export const PERMISSIONS_POLICY =
  'camera=(self "https://api.sumsub.com"), microphone=(self "https://api.sumsub.com")';

export const MOCK_BUTTON_IDS = [
  'mock-approve',
  'mock-decline',
  'mock-cancel',
  'mock-expire',
  'mock-error',
] as const;

/**
 * Per-page CSP. `frame-ancestors *` is deliberate: the page exists to be
 * embedded in a host app's WebView or iframe, and the postMessage origin pin
 * on the client side is what actually authenticates the channel.
 */
export const verificationPageCsp = (provider: string, nonce: string): string => {
  const common = [
    `style-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
    'frame-ancestors *',
  ];

  if (provider === 'sumsub') {
    return [
      "default-src 'none'",
      `script-src 'nonce-${nonce}' https://static.sumsub.com`,
      'connect-src https://api.sumsub.com https://*.sumsub.com',
      'frame-src https://*.sumsub.com',
      "img-src 'self' data: blob: https://*.sumsub.com",
      'media-src blob: mediastream:',
      ...common,
    ].join('; ');
  }

  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    ...common,
  ].join('; ');
};

const sanitizeId = (value: string | undefined): string =>
  value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : 'unknown';

/**
 * JSON safe to inline in a <script> block. Every call site here already
 * passes a defined value (fields are required, or defaulted before this is
 * called), so there is no null/undefined case to guard against.
 */
const jsonForScript = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * Shared bridge emitter. Outbound: React Native first, then the iframe
 * parent. Inbound: window.__kycBridge.setToken(tokenOrEnvelope) for
 * react-native-webview's injectJavaScript, plus a postMessage listener for
 * the web host - both accept the { source, v, type: 'setToken', token }
 * envelope that kyc-core's createSetTokenMessage builds, or a bare string.
 */
const BRIDGE_SCRIPT = `
    var BRIDGE_SOURCE = '${BRIDGE_SOURCE}';
    var BRIDGE_VERSION = ${BRIDGE_PROTOCOL_VERSION};
    function post(type, payload) {
      var message = { source: 'kyc-bridge', v: 1, type: type };
      if (payload) { message.payload = payload; }
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
    }
    function readToken(value) {
      if (typeof value === 'string') { return value; }
      if (value && typeof value === 'object' && typeof value.token === 'string') {
        return value.token;
      }
      return null;
    }
    window.__kycBridge = window.__kycBridge || {};
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { return; }
      }
      if (!data || data.source !== BRIDGE_SOURCE || data.v !== BRIDGE_VERSION) { return; }
      if (data.type === 'setToken' && window.__kycBridge.setToken) {
        window.__kycBridge.setToken(data);
      }
    });`;

/** Browser twin of mapSumsubStatus - see the module header. */
export const SUMSUB_STATUS_FN = `function (reviewStatus, reviewResult) {
      if (reviewStatus === 'completed') {
        var answer = reviewResult && reviewResult.reviewAnswer;
        if (answer === 'GREEN') { return 'approved'; }
        if (answer === 'RED') {
          return reviewResult.reviewRejectType === 'FINAL' ? 'finallyRejected' : 'declined';
        }
        return 'pending';
      }
      if (
        reviewStatus === 'pending' ||
        reviewStatus === 'queued' ||
        reviewStatus === 'prechecked' ||
        reviewStatus === 'onHold'
      ) { return 'pending'; }
      if (reviewStatus === 'init') { return 'incomplete'; }
      return 'initial';
    }`;

export interface MockWebhookPost {
  url: string;
  body: string;
  signature: string;
}

export interface VerificationPageParams {
  sessionId: string;
  provider: string;
  accessToken: string;
  locale?: string;
  applicantId?: string;
  nonce: string;
  webhooks?: { approve: MockWebhookPost; decline: MockWebhookPost };
}

const PAGE_STYLE = `
    body { font-family: system-ui, sans-serif; margin: 0; padding: 0; color: #222; background: #fff; }
    .wrap { padding: 24px; max-width: 480px; margin: 0 auto; text-align: center; }
    h1 { font-size: 18px; }
    .meta { color: #666; font-size: 13px; word-break: break-all; }
    button { display: block; width: 100%; margin: 8px 0; padding: 14px; font-size: 16px; border-radius: 8px; border: none; cursor: pointer; }
    .primary { background: #007aff; color: #fff; font-weight: 600; }
    .plain { background: #eee; color: #333; }
    #sumsub-websdk-container { min-height: 100vh; }`;

export const renderSumsubPage = ({
  sessionId,
  accessToken,
  locale,
  nonce,
}: VerificationPageParams): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Identity Verification</title>
  <style nonce="${nonce}">${PAGE_STYLE}</style>
  <script src="${SUMSUB_SDK_URL}" nonce="${nonce}"></script>
</head>
<body>
  <div id="sumsub-websdk-container"></div>
  <script nonce="${nonce}">${BRIDGE_SCRIPT}
    var mapStatus = ${SUMSUB_STATUS_FN};
    var TERMINAL = { approved: true, finallyRejected: true };
    var applicantId = null;
    var awaitingToken = null;

    window.__kycBridge.setToken = function (value) {
      var token = readToken(value);
      if (token && awaitingToken) {
        var resolve = awaitingToken;
        awaitingToken = null;
        resolve(token);
      }
    };

    // The SDK asks for a fresh token when the current one expires; the host
    // app answers by calling window.__kycBridge.setToken.
    function expirationHandler() {
      post('tokenExpired');
      return new Promise(function (resolve) { awaitingToken = resolve; });
    }

    function onMessage(type, payload) {
      payload = payload || {};
      if (type === 'idCheck.onApplicantLoaded') {
        applicantId = payload.applicantId || applicantId;
        if (applicantId) { post('applicantLoaded', { applicantId: applicantId }); }
        return;
      }
      if (type === 'idCheck.onApplicantSubmitted') { post('submitted'); return; }
      if (type === 'idCheck.onApplicantStatusChanged') {
        var status = mapStatus(payload.reviewStatus, payload.reviewResult);
        post('statusChanged', { status: status });
        if (TERMINAL[status]) {
          post('complete', applicantId ? { status: status, applicantId: applicantId } : { status: status });
        }
        return;
      }
      if (type === 'idCheck.onError') {
        post('error', { code: payload.code || 'PROVIDER_ERROR', message: payload.reason });
      }
    }

    snsWebSdk
      .init(${jsonForScript(accessToken)}, expirationHandler)
      .withConf({ lang: ${jsonForScript(locale ?? 'en')}, theme: 'light' })
      .withOptions({ addViewportTag: false, adaptIframeHeight: true })
      .onMessage(onMessage)
      .on('idCheck.onError', function (error) {
        post('error', {
          code: (error && error.code) || 'PROVIDER_ERROR',
          message: error && error.reason
        });
      })
      .build()
      .launch('#sumsub-websdk-container');

    post('statusChanged', { status: 'incomplete' });
    void ${jsonForScript(sessionId)};
  </script>
</body>
</html>
`;

export const renderMockPage = ({
  sessionId,
  applicantId,
  nonce,
  webhooks,
}: VerificationPageParams): string => {
  const safeSessionId = sanitizeId(sessionId);
  const safeApplicantId = sanitizeId(applicantId);
  const posts = webhooks ?? {
    approve: { url: '/webhook/kyc/mock', body: '{}', signature: '' },
    decline: { url: '/webhook/kyc/mock', body: '{}', signature: '' },
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mock Verification</title>
  <style nonce="${nonce}">${PAGE_STYLE}</style>
</head>
<body>
  <div class="wrap">
    <h1>Mock Identity Verification</h1>
    <p class="meta">Session ${safeSessionId}<br />Applicant ${safeApplicantId}</p>
    <button class="primary" id="mock-approve">Approve</button>
    <button class="plain" id="mock-decline">Decline</button>
    <button class="plain" id="mock-cancel">Cancel</button>
    <button class="plain" id="mock-expire">Expire the token</button>
    <button class="plain" id="mock-error">Simulate an error</button>
  </div>
  <script nonce="${nonce}">${BRIDGE_SCRIPT}
    var applicantId = ${jsonForScript(safeApplicantId)};
    var WEBHOOKS = ${jsonForScript(posts)};

    window.__kycBridge.setToken = function (value) {
      // The mock page has nothing to do with a refreshed token beyond
      // acknowledging it, so the host can assert the round trip.
      if (readToken(value)) { post('statusChanged', { status: 'pending' }); }
    };

    // Drive the backend through the same signed webhook a real provider uses,
    // so the E2E flow exercises the real state machine.
    function notify(which, status) {
      var hook = WEBHOOKS[which];
      return fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mock-Signature': hook.signature },
        body: hook.body
      }).catch(function () { /* the bridge events are the contract */ });
    }

    function finish(which, status) {
      notify(which, status).then(function () {
        post('statusChanged', { status: status });
        post('complete', { status: status, applicantId: applicantId });
      });
    }

    document.getElementById('mock-approve').addEventListener('click', function () {
      finish('approve', 'approved');
    });
    document.getElementById('mock-decline').addEventListener('click', function () {
      finish('decline', 'declined');
    });
    document.getElementById('mock-cancel').addEventListener('click', function () {
      post('cancel');
    });
    document.getElementById('mock-expire').addEventListener('click', function () {
      post('tokenExpired');
    });
    document.getElementById('mock-error').addEventListener('click', function () {
      post('error', { code: 'MOCK_ERROR', message: 'Simulated provider error' });
    });

    post('applicantLoaded', { applicantId: applicantId });
  </script>
</body>
</html>
`;
};

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
    post('sessionExpired');
  </script>
</body>
</html>
`;

export const renderVerificationPage = (params: VerificationPageParams): string => {
  switch (params.provider) {
    case 'sumsub':
      return renderSumsubPage(params);
    case 'mock':
      return renderMockPage(params);
    default:
      return renderNotFoundPage(params.nonce);
  }
};
