// The hosted verification page: a provider's web SDK wrapped in the
// kyc-bridge protocol. Template and escaping discipline come from esign's
// apps/api/src/signingPages.ts; the protocol is the one
// @blinkbitcoin/kyc-core's interpretBridgeMessage reads.
//
// The bridge itself is src/hosted/bridgeScript.ts: this module renders the
// pages that consume it and re-exports its two protocol constants, which
// tests/verificationPages.test.ts pins against kyc-core's.
//
// The Sumsub status rules are NOT duplicated: mapSumsubStatus comes from
// @blinkbitcoin/kyc-core/sumsub, and the page gets a JSON table generated from it
// over the finite reviewStatus x reviewAnswer x rejectType vocabulary. The
// browser only does a lookup with a fallback chain (drop the reject type,
// then the answer, then default) - the fallbacks mirror the shape of
// mapSumsubStatus's switch, never its verdicts.

import type { SumsubReviewResult } from '@blinkbitcoin/kyc-core/sumsub';
import {
  mapSumsubStatus,
  SUMSUB_ERROR_CODE,
  SUMSUB_REJECT_TYPES,
  SUMSUB_REVIEW_ANSWERS,
  SUMSUB_REVIEW_STATUSES,
} from '@blinkbitcoin/kyc-core/sumsub';

import { BRIDGE_SCRIPT } from './hosted/bridgeScript';

export { BRIDGE_PROTOCOL_VERSION, BRIDGE_SOURCE } from './hosted/bridgeScript';

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

/** An opaque identifier, or null when the value is missing or not one. */
const sanitizeId = (value: string | undefined): string | null =>
  value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : null;

/**
 * JSON safe to inline in a <script> block. Escapes the same three
 * characters kyc-core's escapeForScript does: `<` (so a value can never
 * close the script tag) and U+2028/U+2029, which are valid in JSON strings
 * but are line terminators in a script body.
 */
const jsonForScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** What mapSumsubStatus returns for a review status it does not know. */
export const SUMSUB_STATUS_FALLBACK = 'initial';

/** `<reviewStatus>|<reviewAnswer>|<reviewRejectType>`, '' for an absent field. */
export const sumsubStatusKey = (
  reviewStatus: string,
  reviewAnswer: string,
  reviewRejectType: string
): string => `${reviewStatus}|${reviewAnswer}|${reviewRejectType}`;

/**
 * Every documented combination, resolved once through the shared mapping so
 * the page ships data instead of logic.
 */
export const buildSumsubStatusTable = (): Record<string, string> => {
  const table: Record<string, string> = {};

  for (const reviewStatus of SUMSUB_REVIEW_STATUSES) {
    for (const reviewAnswer of ['', ...SUMSUB_REVIEW_ANSWERS]) {
      for (const reviewRejectType of ['', ...SUMSUB_REJECT_TYPES]) {
        table[sumsubStatusKey(reviewStatus, reviewAnswer, reviewRejectType)] = mapSumsubStatus(
          reviewStatus,
          reviewAnswer
            ? ({
                reviewAnswer,
                ...(reviewRejectType ? { reviewRejectType } : {}),
              } as SumsubReviewResult)
            : undefined
        );
      }
    }
  }

  return table;
};

export const SUMSUB_STATUS_TABLE = buildSumsubStatusTable();

/**
 * The TypeScript twin of the page's four-line lookup (below). It carries no
 * Sumsub rule of its own - only the fallback order - and the test drives it
 * against mapSumsubStatus over the whole vocabulary.
 */
export const lookupSumsubStatus = (
  table: Record<string, string>,
  reviewStatus?: string,
  reviewResult?: SumsubReviewResult
): string => {
  const status = reviewStatus ?? '';
  const answer = reviewResult?.reviewAnswer ?? '';
  const rejectType = reviewResult?.reviewRejectType ?? '';

  return (
    table[sumsubStatusKey(status, answer, rejectType)] ??
    table[sumsubStatusKey(status, answer, '')] ??
    table[sumsubStatusKey(status, '', '')] ??
    SUMSUB_STATUS_FALLBACK
  );
};

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
    var STATUS_TABLE = ${jsonForScript(SUMSUB_STATUS_TABLE)};
    function mapStatus(reviewStatus, reviewResult) {
      var r = reviewResult || {};
      var s = reviewStatus || '';
      var a = r.reviewAnswer || '';
      var t = r.reviewRejectType || '';
      return STATUS_TABLE[s + '|' + a + '|' + t] ||
        STATUS_TABLE[s + '|' + a + '|'] ||
        STATUS_TABLE[s + '||'] ||
        '${SUMSUB_STATUS_FALLBACK}';
    }
    var TERMINAL = { approved: true, finallyRejected: true };
    var applicantId = null;
    var awaitingToken = null;

    window.__kycBridge.setToken = function (value) {
      var token = window.__kycBridge.readToken(value);
      if (token && awaitingToken) {
        var resolve = awaitingToken;
        awaitingToken = null;
        resolve(token);
      }
    };

    // The SDK asks for a fresh token when the current one expires; the host
    // app answers by calling window.__kycBridge.setToken.
    function expirationHandler() {
      window.__kycBridge.post('tokenExpired');
      return new Promise(function (resolve) { awaitingToken = resolve; });
    }

    function onMessage(type, payload) {
      payload = payload || {};
      if (type === 'idCheck.onApplicantLoaded') {
        applicantId = payload.applicantId || applicantId;
        if (applicantId) { window.__kycBridge.post('applicantLoaded', { applicantId: applicantId }); }
        return;
      }
      if (type === 'idCheck.onApplicantSubmitted' ||
          type === 'idCheck.onApplicantResubmitted') { window.__kycBridge.post('submitted'); return; }
      if (type === 'idCheck.onApplicantStatusChanged') {
        var status = mapStatus(payload.reviewStatus, payload.reviewResult);
        window.__kycBridge.post('statusChanged', { status: status });
        if (TERMINAL[status]) {
          window.__kycBridge.post('complete', applicantId ? { status: status, applicantId: applicantId } : { status: status });
        }
        return;
      }
      // idCheck.onError is NOT handled here: the dedicated .on() registration
      // below carries it, and handling it in both places posts the same
      // provider error twice.
    }

    snsWebSdk
      .init(${jsonForScript(accessToken)}, expirationHandler)
      .withConf({ lang: ${jsonForScript(locale ?? 'en')}, theme: 'light' })
      .withOptions({ addViewportTag: false, adaptIframeHeight: true })
      .onMessage(onMessage)
      .on('idCheck.onError', function (error) {
        window.__kycBridge.post('error', {
          code: (error && error.code) || ${jsonForScript(SUMSUB_ERROR_CODE)},
          message: error && error.reason
        });
      })
      .build()
      .launch('#sumsub-websdk-container');

    window.__kycBridge.post('statusChanged', { status: 'incomplete' });
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
  const safeSessionId = sanitizeId(sessionId) ?? 'unknown';
  // Never a placeholder applicant id: an unbound session simply omits the
  // field, which kyc-core's interpretBridgeMessage accepts.
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
    <p class="meta">Session ${safeSessionId}${
      safeApplicantId ? `<br />Applicant ${safeApplicantId}` : ''
    }</p>
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
      // acknowledging it, so the host can assert the round trip. The
      // acknowledgement is DOM, never a bridge envelope: a 'statusChanged'
      // here would move the host's state machine (pending hides the page and
      // mutes its controls), so a token refresh would end the flow instead of
      // resuming it. Both inbound shapes land here - the bare token React
      // Native injects and the envelope the web host posts - because
      // readToken normalizes them.
      if (!window.__kycBridge.readToken(value)) { return; }
      document.body.dataset.tokenRefreshed = 'true';
      if (!document.getElementById('mock-token-refreshed')) {
        var ack = document.createElement('p');
        ack.id = 'mock-token-refreshed';
        ack.className = 'meta';
        ack.textContent = 'Token refreshed';
        document.querySelector('.wrap').appendChild(ack);
      }
    };

    // Drive the backend through the same signed webhook a real provider uses,
    // so the E2E flow exercises the real state machine.
    function notify(which) {
      var hook = WEBHOOKS[which];
      return fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mock-Signature': hook.signature },
        body: hook.body
      }).catch(function () { /* the bridge events are the contract */ });
    }

    function finish(which, status) {
      notify(which).then(function () {
        window.__kycBridge.post('statusChanged', { status: status });
        window.__kycBridge.post('complete', applicantId ? { status: status, applicantId: applicantId } : { status: status });
      });
    }

    document.getElementById('mock-approve').addEventListener('click', function () {
      finish('approve', 'approved');
    });
    document.getElementById('mock-decline').addEventListener('click', function () {
      finish('decline', 'declined');
    });
    document.getElementById('mock-cancel').addEventListener('click', function () {
      window.__kycBridge.post('cancel');
    });
    document.getElementById('mock-expire').addEventListener('click', function () {
      window.__kycBridge.post('tokenExpired');
    });
    document.getElementById('mock-error').addEventListener('click', function () {
      window.__kycBridge.post('error', { code: 'MOCK_ERROR', message: 'Simulated provider error' });
    });

    if (applicantId) { window.__kycBridge.post('applicantLoaded', { applicantId: applicantId }); }
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
    window.__kycBridge.post('sessionExpired');
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
