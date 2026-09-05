import { mapSumsubStatus } from '../src/providers/sumsub/mapping';
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SOURCE,
  MOCK_BUTTON_IDS,
  PERMISSIONS_POLICY,
  renderMockPage,
  renderNotFoundPage,
  renderSumsubPage,
  renderVerificationPage,
  SUMSUB_SDK_URL,
  SUMSUB_STATUS_FN,
  verificationPageCsp,
} from '../src/verificationPages';

const NONCE = 'test-nonce';

const sumsubParams = {
  sessionId: 'session-1',
  provider: 'sumsub',
  accessToken: 'sumsub-token',
  locale: 'en',
  nonce: NONCE,
};

const mockParams = {
  sessionId: 'session-1',
  provider: 'mock',
  accessToken: 'mock-token-1',
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

describe('bridge protocol constants', () => {
  it('match the published @blinkbitcoin/kyc-core protocol', () => {
    // The backend has no dependency on kyc-core, so the values are pinned
    // here instead. If Phase 2's BRIDGE_PROTOCOL_VERSION ever changes, this
    // test is the thing that must be updated together with the page.
    expect(BRIDGE_SOURCE).toBe('kyc-bridge');
    expect(BRIDGE_PROTOCOL_VERSION).toBe(1);
  });
});

describe('verificationPageCsp', () => {
  it('locks the mock page down to its own nonce', () => {
    const csp = verificationPageCsp('mock', NONCE);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`script-src 'nonce-${NONCE}'`);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain('frame-ancestors *');
    expect(csp).not.toContain('sumsub.com');
  });

  it('allows exactly the Sumsub origins the web SDK needs', () => {
    const csp = verificationPageCsp('sumsub', NONCE);
    expect(csp).toContain(`script-src 'nonce-${NONCE}' https://static.sumsub.com`);
    expect(csp).toContain('connect-src https://api.sumsub.com https://*.sumsub.com');
    expect(csp).toContain('frame-src https://*.sumsub.com');
    expect(csp).toContain('media-src blob: mediastream:');
    expect(csp).toContain('frame-ancestors *');
  });
});

describe('PERMISSIONS_POLICY', () => {
  it('grants camera and microphone to the page and to Sumsub', () => {
    expect(PERMISSIONS_POLICY).toBe(
      'camera=(self "https://api.sumsub.com"), microphone=(self "https://api.sumsub.com")'
    );
  });
});

describe('renderSumsubPage', () => {
  const html = renderSumsubPage(sumsubParams);

  it('loads the Sumsub Web SDK builder', () => {
    expect(html).toContain(`<script src="${SUMSUB_SDK_URL}"`);
    expect(SUMSUB_SDK_URL).toBe('https://static.sumsub.com/idensic/static/sns-websdk-builder.js');
  });

  it('nonces every inline script and style', () => {
    for (const tag of html.match(/<(script|style)(?![^>]*src=)[^>]*>/g) ?? []) {
      expect(tag).toContain(`nonce="${NONCE}"`);
    }
  });

  it('embeds the access token and the launch options', () => {
    expect(html).toContain('"sumsub-token"');
    expect(html).toContain('addViewportTag: false');
    expect(html).toContain('adaptIframeHeight: true');
    expect(html).toContain("launch('#sumsub-websdk-container')");
    expect(html).toContain('id="sumsub-websdk-container"');
  });

  it('translates every idCheck event this version knows', () => {
    for (const type of [
      'idCheck.onApplicantLoaded',
      'idCheck.onApplicantSubmitted',
      'idCheck.onApplicantStatusChanged',
      'idCheck.onError',
    ]) {
      expect(html).toContain(type);
    }
  });

  it('emits versioned kyc-bridge envelopes over both transports', () => {
    expect(html).toContain("source: 'kyc-bridge'");
    expect(html).toContain('v: 1');
    expect(html).toContain('window.ReactNativeWebView.postMessage');
    expect(html).toContain('window.parent.postMessage');
  });

  it('installs window.__kycBridge.setToken and a setToken message listener', () => {
    expect(html).toContain('window.__kycBridge');
    expect(html).toContain('setToken');
    expect(html).toContain("addEventListener('message'");
  });

  it('escapes a hostile token instead of breaking out of the script', () => {
    const hostile = renderSumsubPage({ ...sumsubParams, accessToken: '</script><script>x' });
    expect(hostile).not.toContain('</script><script>x');
    expect(hostile).toContain('\\u003c/script');
  });

  it('defaults the SDK language to en when no locale is given', () => {
    const { locale, ...withoutLocale } = sumsubParams;
    void locale;
    const html = renderSumsubPage(withoutLocale);
    expect(html).toContain('lang: "en"');
  });
});

describe('the page status mapping mirrors the server mapping', () => {
  // eslint-disable-next-line no-new-func
  const pageMap = new Function(`return (${SUMSUB_STATUS_FN});`)() as (
    reviewStatus?: string,
    reviewResult?: Record<string, unknown>
  ) => string;

  it.each([
    ['completed', { reviewAnswer: 'GREEN' }],
    ['completed', { reviewAnswer: 'RED', reviewRejectType: 'FINAL' }],
    ['completed', { reviewAnswer: 'RED', reviewRejectType: 'RETRY' }],
    ['completed', { reviewAnswer: 'RED' }],
    ['completed', undefined],
    ['pending', undefined],
    ['queued', undefined],
    ['prechecked', undefined],
    ['onHold', undefined],
    ['init', undefined],
    ['somethingNew', undefined],
    [undefined, undefined],
  ])('agrees for %s / %j', (reviewStatus, reviewResult) => {
    expect(pageMap(reviewStatus, reviewResult)).toBe(
      mapSumsubStatus(reviewStatus, reviewResult as never)
    );
  });
});

describe('renderMockPage', () => {
  const html = renderMockPage(mockParams);

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

  it('emits the same bridge envelopes as the Sumsub page', () => {
    expect(html).toContain("source: 'kyc-bridge'");
    expect(html).toContain("post('cancel')");
    expect(html).toContain("post('tokenExpired')");
    expect(html).toContain("post('error'");
    expect(html).toContain('window.__kycBridge');
  });

  it('shows the session and applicant it is driving', () => {
    expect(html).toContain('session-1');
    expect(html).toContain('mock-applicant-1');
  });

  it('sanitizes ids that are not opaque identifiers', () => {
    const hostile = renderMockPage({
      ...mockParams,
      sessionId: '<img src=x onerror=1>',
      applicantId: undefined,
    });
    expect(hostile).not.toContain('<img');
    expect(hostile).toContain('unknown');
  });

  it('defaults to empty pre-signed webhooks when none are given', () => {
    const { webhooks, ...withoutWebhooks } = mockParams;
    void webhooks;
    const html = renderMockPage(withoutWebhooks);
    expect(html).toContain('/webhook/kyc/mock');
    expect(html).toContain('"body":"{}"');
  });
});

describe('renderVerificationPage', () => {
  it('dispatches on the provider', () => {
    expect(renderVerificationPage({ ...sumsubParams })).toBe(renderSumsubPage(sumsubParams));
    expect(renderVerificationPage(mockParams)).toBe(renderMockPage(mockParams));
  });

  it('renders the not-found page for a provider it cannot serve', () => {
    expect(renderVerificationPage({ ...sumsubParams, provider: 'other' })).toBe(
      renderNotFoundPage(NONCE)
    );
  });
});

describe('renderNotFoundPage', () => {
  it('emits a sessionExpired envelope so a waiting host stops spinning', () => {
    const html = renderNotFoundPage(NONCE);
    expect(html).toContain("post('sessionExpired')");
    expect(html).toContain(`nonce="${NONCE}"`);
  });
});
