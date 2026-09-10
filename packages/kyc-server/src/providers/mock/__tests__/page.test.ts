import { BRIDGE_SCRIPT } from '../../../bridge/script';
import { MOCK_BUTTON_IDS, renderMockPage } from '../page';

const NONCE = 'test-nonce';

const params = {
  sessionId: 'session-1',
  applicantId: 'mock-applicant-1',
  nonce: NONCE,
  webhooks: {
    approve: {
      url: '/webhook/kyc/mock',
      body: '{"applicantId":"a1","status":"approved"}',
      signature: 'sig-a',
    },
    decline: {
      url: '/webhook/kyc/mock',
      body: '{"applicantId":"a1","status":"declined"}',
      signature: 'sig-d',
    },
  },
};

describe('renderMockPage', () => {
  const html = renderMockPage(params);

  it('exposes the five documented control ids', () => {
    expect(MOCK_BUTTON_IDS).toEqual([
      'mock-approve',
      'mock-decline',
      'mock-cancel',
      'mock-expire',
      'mock-error',
    ]);
    for (const id of MOCK_BUTTON_IDS) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('posts the pre-signed webhook bodies back to the backend', () => {
    expect(html).toContain('/webhook/kyc/mock');
    expect(html).toContain('sig-a');
    expect(html).toContain('sig-d');
    expect(html).toContain('X-Mock-Signature');
  });

  it('drives the same bridge as a real provider page, over the mock controls', () => {
    expect(html).toContain(`<script nonce="${NONCE}">${BRIDGE_SCRIPT}`);
    expect(html).toContain("window.__kycBridge.post('cancel')");
    expect(html).toContain("window.__kycBridge.post('tokenExpired')");
    expect(html).toContain("window.__kycBridge.post('error'");
  });

  it('acknowledges a refreshed token in the DOM and stays interactive', () => {
    // The acknowledgement must not be a bridge envelope: 'statusChanged' with
    // 'pending' would hide and mute the page in the host, so a token refresh
    // would end the flow instead of resuming it. The E2E flows read the
    // dataset flag / the visible paragraph and then press Approve or Decline.
    const setToken = html
      .slice(
        html.indexOf('window.__kycBridge.setToken = function'),
        html.indexOf('function notify('),
      )
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
    expect(setToken).toContain("document.body.dataset.tokenRefreshed = 'true'");
    expect(setToken).toContain("ack.id = 'mock-token-refreshed'");
    expect(setToken).toContain("ack.textContent = 'Token refreshed'");
    expect(setToken).toContain(
      "if (!document.getElementById('mock-token-refreshed'))",
    );
    expect(setToken).not.toContain('statusChanged');
    expect(setToken).not.toContain('post(');
  });

  it('shows the session and applicant it is driving', () => {
    expect(html).toContain('session-1');
    expect(html).toContain('mock-applicant-1');
  });

  it('sanitizes a session id that is not an opaque identifier', () => {
    const hostile = renderMockPage({
      ...params,
      sessionId: '<img src=x onerror=1>',
    });
    expect(hostile).not.toContain('<img');
    expect(hostile).toContain('Session unknown');
  });

  // kyc-core's interpretBridgeMessage takes `complete` with or without an
  // applicantId, and drops `applicantLoaded` without one - so an unbound
  // session omits the field rather than claiming an applicant called
  // "unknown".
  it.each([undefined, '<img src=x onerror=1>'])(
    'omits the applicant entirely when it is %s',
    applicantId => {
      const page = renderMockPage({ ...params, applicantId });
      expect(page).not.toContain('unknown');
      expect(page).not.toContain('Applicant');
      expect(page).toContain('var applicantId = null;');
      expect(page).toContain(
        "if (applicantId) { window.__kycBridge.post('applicantLoaded'",
      );
    },
  );

  it('defaults to empty pre-signed webhooks when none are given', () => {
    const page = renderMockPage({
      sessionId: params.sessionId,
      applicantId: params.applicantId,
      nonce: params.nonce,
    });
    expect(page).toContain('/webhook/kyc/mock');
    expect(page).toContain('"body":"{}"');
  });
});
