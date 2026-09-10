// The mock provider's hosted page: five buttons that drive the same
// kyc-bridge protocol a real provider page speaks, and post the pre-signed
// webhooks the mock provider signed for this session, so every E2E flow
// (backend, Playwright, Maestro) exercises the real state machine.

import { BRIDGE_SCRIPT } from '../../bridge/script';
import { jsonForScript, sanitizeId } from '../../html';
import { PAGE_STYLE } from '../../pages';

export const MOCK_BUTTON_IDS = [
  'mock-approve',
  'mock-decline',
  'mock-cancel',
  'mock-expire',
  'mock-error',
] as const;

/** A webhook the page posts back, signed by the mock provider. */
export interface MockWebhookPost {
  url: string;
  body: string;
  signature: string;
}

export interface MockPageParams {
  sessionId: string;
  applicantId?: string;
  nonce: string;
  webhooks?: { approve: MockWebhookPost; decline: MockWebhookPost };
}

export const renderMockPage = ({
  sessionId,
  applicantId,
  nonce,
  webhooks,
}: MockPageParams): string => {
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
