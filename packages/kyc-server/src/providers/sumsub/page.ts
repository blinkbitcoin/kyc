// The Sumsub hosted page: the Sumsub Web SDK wrapped in the kyc-bridge
// protocol, and the security headers it needs. The Sumsub status rules are
// NOT duplicated here: mapSumsubStatus comes from @blinkbitcoin/kyc-core/sumsub,
// and the page gets a JSON table generated from it over the finite
// reviewStatus x reviewAnswer x rejectType vocabulary. The browser only does
// a lookup with a fallback chain (drop the reject type, then the answer, then
// default) - the fallbacks mirror the shape of mapSumsubStatus's switch,
// never its verdicts.

import type { SumsubReviewResult } from '@blinkbitcoin/kyc-core/sumsub';
import {
  mapSumsubStatus,
  SUMSUB_ERROR_CODE,
  SUMSUB_REJECT_TYPES,
  SUMSUB_REVIEW_ANSWERS,
  SUMSUB_REVIEW_STATUSES,
} from '@blinkbitcoin/kyc-core/sumsub';
import { BRIDGE_SCRIPT } from '../../bridge/script';
import { jsonForScript } from '../../html';
import { type HostedPageParams, hostedPageCsp, PAGE_STYLE } from '../../pages';
import type { HostedPageRenderer } from '../../provider';

export const SUMSUB_SDK_URL =
  'https://static.sumsub.com/idensic/static/sns-websdk-builder.js';

/** Camera and microphone for the page itself and for Sumsub's own frames. */
export const SUMSUB_PERMISSIONS_POLICY =
  'camera=(self "https://api.sumsub.com"), microphone=(self "https://api.sumsub.com")';

/** Exactly the Sumsub origins the web SDK needs, on top of the neutral CSP. */
export const sumsubPageCsp = (nonce: string): string =>
  hostedPageCsp(nonce, {
    scriptSrc: ['https://static.sumsub.com'],
    connectSrc: ['https://api.sumsub.com', 'https://*.sumsub.com'],
    extra: [
      'frame-src https://*.sumsub.com',
      "img-src 'self' data: blob: https://*.sumsub.com",
      'media-src blob: mediastream:',
    ],
  });

/** What mapSumsubStatus returns for a review status it does not know. */
export const SUMSUB_STATUS_FALLBACK = 'initial';

/** `<reviewStatus>|<reviewAnswer>|<reviewRejectType>`, '' for an absent field. */
export const sumsubStatusKey = (
  reviewStatus: string,
  reviewAnswer: string,
  reviewRejectType: string,
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
        table[sumsubStatusKey(reviewStatus, reviewAnswer, reviewRejectType)] =
          mapSumsubStatus(
            reviewStatus,
            reviewAnswer
              ? ({
                  reviewAnswer,
                  ...(reviewRejectType ? { reviewRejectType } : {}),
                } as SumsubReviewResult)
              : undefined,
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
  reviewResult?: SumsubReviewResult,
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

export const renderSumsubPage = ({
  accessToken,
  locale,
  nonce,
}: HostedPageParams): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Identity Verification</title>
  <style nonce="${nonce}">${PAGE_STYLE}
    #sumsub-websdk-container { min-height: 100vh; }</style>
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

/** The Sumsub page as the provider's hosted-page capability. */
export const sumsubHostedPage: HostedPageRenderer = {
  render: renderSumsubPage,
  csp: sumsubPageCsp,
  permissionsPolicy: SUMSUB_PERMISSIONS_POLICY,
};
