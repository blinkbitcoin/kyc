import {
  mapSumsubStatus,
  SUMSUB_ERROR_CODE,
  SUMSUB_EVENT_NAMES,
  SUMSUB_REJECT_TYPES,
  SUMSUB_REVIEW_ANSWERS,
  SUMSUB_REVIEW_STATUSES,
} from '@blinkbitcoin/kyc-sumsub';

import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SOURCE,
  buildSumsubStatusTable,
  lookupSumsubStatus,
  MOCK_BUTTON_IDS,
  PERMISSIONS_POLICY,
  renderMockPage,
  renderNotFoundPage,
  renderSumsubPage,
  renderVerificationPage,
  SUMSUB_SDK_URL,
  SUMSUB_STATUS_TABLE,
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

  it('translates every idCheck event the shared vocabulary declares', () => {
    // SUMSUB_EVENT_NAMES is the one list; the page must not silently know a
    // smaller set than the mapping the RN/web sources read.
    for (const type of SUMSUB_EVENT_NAMES) {
      expect(html).toContain(type);
    }
  });

  it('treats a resubmission as a submission', () => {
    expect(html).toContain("type === 'idCheck.onApplicantResubmitted'");
    expect(html).toContain("post('submitted')");
  });

  it('reports a provider error exactly once, under the shared fallback code', () => {
    // One Sumsub error must produce one bridge event: the .on() registration
    // is the single handler, and onMessage no longer duplicates it.
    expect(html.match(/post\('error'/g)).toHaveLength(1);
    expect(html).toContain("idCheck.onError', function (error)");
    expect(html).not.toContain("if (type === 'idCheck.onError')");
  });

  it('embeds the fallback error code from the shared mapping, not a literal', () => {
    expect(SUMSUB_ERROR_CODE).toBe('SUMSUB_ERROR');
    expect(html).toContain(`|| ${JSON.stringify(SUMSUB_ERROR_CODE)}`);
    expect(html).not.toContain('PROVIDER_ERROR');
  });

  it('emits versioned kyc-bridge envelopes over both transports', () => {
    // The envelope is built from the declared constants, not from literals,
    // so the pin test above is what keeps the page and kyc-core in step.
    expect(html).toContain(`var BRIDGE_SOURCE = '${BRIDGE_SOURCE}';`);
    expect(html).toContain(`var BRIDGE_VERSION = ${BRIDGE_PROTOCOL_VERSION};`);
    expect(html).toContain('{ source: BRIDGE_SOURCE, v: BRIDGE_VERSION, type: type }');
    expect(html).toContain('window.ReactNativeWebView.postMessage');
    expect(html).toContain('window.parent.postMessage');
  });

  it('escapes the line terminators that are legal in JSON but not in a script', () => {
    const hostile = renderSumsubPage({
      ...sumsubParams,
      accessToken: 'a\u2028b\u2029c',
    });
    expect(hostile).not.toMatch(/[\u2028\u2029]/);
    expect(hostile).toContain('\\u2028');
    expect(hostile).toContain('\\u2029');
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

  it('passes the session locale to the SDK', () => {
    expect(renderSumsubPage({ ...sumsubParams, locale: 'fr-FR' })).toContain('lang: "fr-FR"');
  });

  it('defaults the SDK language to en when no locale is given', () => {
    const { locale, ...withoutLocale } = sumsubParams;
    void locale;
    const html = renderSumsubPage(withoutLocale);
    expect(html).toContain('lang: "en"');
  });
});

describe('the page status table is generated from the shared mapping', () => {
  it('covers every documented reviewStatus x answer x rejectType combination', () => {
    const table = buildSumsubStatusTable();
    expect(table).toEqual(SUMSUB_STATUS_TABLE);
    expect(Object.keys(table)).toHaveLength(
      SUMSUB_REVIEW_STATUSES.length *
        (SUMSUB_REVIEW_ANSWERS.length + 1) *
        (SUMSUB_REJECT_TYPES.length + 1)
    );

    for (const reviewStatus of SUMSUB_REVIEW_STATUSES) {
      for (const reviewAnswer of [undefined, ...SUMSUB_REVIEW_ANSWERS]) {
        for (const reviewRejectType of [undefined, ...SUMSUB_REJECT_TYPES]) {
          const reviewResult = reviewAnswer ? { reviewAnswer, reviewRejectType } : undefined;
          expect(lookupSumsubStatus(table, reviewStatus, reviewResult)).toBe(
            mapSumsubStatus(reviewStatus, reviewResult)
          );
        }
      }
    }
  });

  it('falls back exactly like mapSumsubStatus for input outside the vocabulary', () => {
    const table = SUMSUB_STATUS_TABLE;
    // Unknown review status -> initial; unknown verdict fields degrade to the
    // less specific row instead of guessing.
    expect(lookupSumsubStatus(table, 'somethingNew')).toBe('initial');
    expect(lookupSumsubStatus(table, undefined)).toBe('initial');
    expect(lookupSumsubStatus(table, 'completed', { reviewAnswer: 'BLUE' } as never)).toBe(
      'pending'
    );
    expect(
      lookupSumsubStatus(table, 'completed', {
        reviewAnswer: 'RED',
        reviewRejectType: 'SOMETHING' as never,
      })
    ).toBe('declined');
  });

  it('is embedded in the page as JSON, with no second implementation of the rules', () => {
    const html = renderSumsubPage(sumsubParams);
    expect(html).toContain(JSON.stringify(SUMSUB_STATUS_TABLE).replace(/</g, '\\u003c'));
    expect(html).toContain('function mapStatus(');
    expect(html).not.toContain("=== 'GREEN'");
    expect(html).not.toContain('reviewRejectType ===');
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
    expect(html).toContain('{ source: BRIDGE_SOURCE, v: BRIDGE_VERSION, type: type }');
    expect(html).toContain("post('cancel')");
    expect(html).toContain("post('tokenExpired')");
    expect(html).toContain("post('error'");
    expect(html).toContain('window.__kycBridge');
  });

  it('acknowledges a refreshed token in the DOM and stays interactive', () => {
    // The acknowledgement must not be a bridge envelope: 'statusChanged' with
    // 'pending' would hide and mute the page in the host, so a token refresh
    // would end the flow instead of resuming it. The E2E flows read the
    // dataset flag / the visible paragraph and then press Approve or Decline.
    const setToken = html
      .slice(html.indexOf('window.__kycBridge.setToken'), html.indexOf('function notify('))
      // The handler's own comments explain what it must NOT do, so the
      // negative assertions below judge the code alone.
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(setToken).toContain("document.body.dataset.tokenRefreshed = 'true'");
    expect(setToken).toContain("ack.id = 'mock-token-refreshed'");
    expect(setToken).toContain("ack.textContent = 'Token refreshed'");
    // Idempotent: a second refresh must not append a second paragraph.
    expect(setToken).toContain("if (!document.getElementById('mock-token-refreshed'))");
    expect(setToken).not.toContain('statusChanged');
    expect(setToken).not.toContain('post(');
  });

  it('shows the session and applicant it is driving', () => {
    expect(html).toContain('session-1');
    expect(html).toContain('mock-applicant-1');
  });

  it('sanitizes a session id that is not an opaque identifier', () => {
    const hostile = renderMockPage({ ...mockParams, sessionId: '<img src=x onerror=1>' });
    expect(hostile).not.toContain('<img');
    expect(hostile).toContain('Session unknown');
  });

  // kyc-core's interpretBridgeMessage takes `complete` with or without an
  // applicantId, and drops `applicantLoaded` without one - so an unbound
  // session omits the field rather than claiming an applicant called
  // "unknown".
  it.each([undefined, '<img src=x onerror=1>'])(
    'omits the applicant entirely when it is %s',
    (applicantId) => {
      const page = renderMockPage({ ...mockParams, applicantId });
      expect(page).not.toContain('unknown');
      expect(page).not.toContain('Applicant');
      expect(page).toContain('var applicantId = null;');
      expect(page).toContain("if (applicantId) { post('applicantLoaded'");
    }
  );

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
