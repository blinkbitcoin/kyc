import {
  mapSumsubStatus,
  SUMSUB_ERROR_CODE,
  SUMSUB_EVENT_NAMES,
  SUMSUB_REJECT_TYPES,
  SUMSUB_REVIEW_ANSWERS,
  SUMSUB_REVIEW_STATUSES,
} from '@blinkbitcoin/kyc-core/sumsub';
import { BRIDGE_SCRIPT } from '../../../bridge/script';
import {
  buildSumsubStatusTable,
  lookupSumsubStatus,
  renderSumsubPage,
  SUMSUB_PERMISSIONS_POLICY,
  SUMSUB_SDK_URL,
  SUMSUB_STATUS_TABLE,
  sumsubHostedPage,
  sumsubPageCsp,
} from '../page';

const NONCE = 'test-nonce';

const params = {
  sessionId: 'session-1',
  userId: 'user-1',
  accessToken: 'sumsub-token',
  locale: 'en',
  nonce: NONCE,
};

describe('sumsubPageCsp', () => {
  it('allows exactly the Sumsub origins the web SDK needs', () => {
    const csp = sumsubPageCsp(NONCE);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(
      `script-src 'nonce-${NONCE}' https://static.sumsub.com`,
    );
    expect(csp).toContain(
      'connect-src https://api.sumsub.com https://*.sumsub.com',
    );
    expect(csp).toContain('frame-src https://*.sumsub.com');
    expect(csp).toContain('media-src blob: mediastream:');
    expect(csp).toContain('frame-ancestors *');
    expect(csp).not.toContain("connect-src 'self'");
  });
});

describe('SUMSUB_PERMISSIONS_POLICY', () => {
  it('grants camera and microphone to the page and to Sumsub', () => {
    expect(SUMSUB_PERMISSIONS_POLICY).toBe(
      'camera=(self "https://api.sumsub.com"), microphone=(self "https://api.sumsub.com")',
    );
    expect(sumsubHostedPage).toEqual({
      render: renderSumsubPage,
      csp: sumsubPageCsp,
      permissionsPolicy: SUMSUB_PERMISSIONS_POLICY,
    });
  });
});

describe('renderSumsubPage', () => {
  const html = renderSumsubPage(params);

  it('loads the Sumsub Web SDK builder', () => {
    expect(html).toContain(`<script src="${SUMSUB_SDK_URL}"`);
    expect(SUMSUB_SDK_URL).toBe(
      'https://static.sumsub.com/idensic/static/sns-websdk-builder.js',
    );
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
    for (const type of SUMSUB_EVENT_NAMES) {
      expect(html).toContain(type);
    }
    expect(html).toContain("type === 'idCheck.onApplicantResubmitted'");
    expect(html).toContain("post('submitted')");
  });

  it('reports a provider error exactly once, under the shared fallback code', () => {
    expect(html.match(/post\('error'/g)).toHaveLength(1);
    expect(html).toContain("idCheck.onError', function (error)");
    expect(html).not.toContain("if (type === 'idCheck.onError')");
    expect(SUMSUB_ERROR_CODE).toBe('SUMSUB_ERROR');
    expect(html).toContain(`|| ${JSON.stringify(SUMSUB_ERROR_CODE)}`);
  });

  it('inlines the shared bridge inside the nonced script block', () => {
    expect(html).toContain(`<script nonce="${NONCE}">${BRIDGE_SCRIPT}`);
  });

  it('escapes hostile tokens and line terminators instead of breaking out of the script', () => {
    const hostile = renderSumsubPage({
      ...params,
      accessToken: '</script><script>x\u2028y',
    });
    expect(hostile).not.toContain('</script><script>x');
    expect(hostile).toContain('\\u003c/script');
    expect(hostile).not.toMatch(/[\u2028\u2029]/);
  });

  it('resolves the SDK token-expiration promise from a refreshed token', () => {
    expect(html).toContain('window.__kycBridge.setToken = function (value) {');
    expect(html).toContain('window.__kycBridge.readToken(value)');
    expect(html).toContain("window.__kycBridge.post('tokenExpired')");
  });

  it('passes the session locale to the SDK, defaulting to en', () => {
    expect(renderSumsubPage({ ...params, locale: 'fr-FR' })).toContain(
      'lang: "fr-FR"',
    );
    const withoutLocale = {
      sessionId: params.sessionId,
      userId: params.userId,
      accessToken: params.accessToken,
      nonce: params.nonce,
    };
    expect(renderSumsubPage(withoutLocale)).toContain('lang: "en"');
  });
});

describe('the page status table is generated from the shared mapping', () => {
  it('covers every documented reviewStatus x answer x rejectType combination', () => {
    const table = buildSumsubStatusTable();
    expect(table).toEqual(SUMSUB_STATUS_TABLE);
    expect(Object.keys(table)).toHaveLength(
      SUMSUB_REVIEW_STATUSES.length *
        (SUMSUB_REVIEW_ANSWERS.length + 1) *
        (SUMSUB_REJECT_TYPES.length + 1),
    );
    for (const reviewStatus of SUMSUB_REVIEW_STATUSES) {
      for (const reviewAnswer of [undefined, ...SUMSUB_REVIEW_ANSWERS]) {
        for (const reviewRejectType of [undefined, ...SUMSUB_REJECT_TYPES]) {
          const reviewResult = reviewAnswer
            ? { reviewAnswer, reviewRejectType }
            : undefined;
          expect(lookupSumsubStatus(table, reviewStatus, reviewResult)).toBe(
            mapSumsubStatus(reviewStatus, reviewResult),
          );
        }
      }
    }
  });

  it('falls back exactly like mapSumsubStatus for input outside the vocabulary', () => {
    const table = SUMSUB_STATUS_TABLE;
    expect(lookupSumsubStatus(table, 'somethingNew')).toBe('initial');
    expect(lookupSumsubStatus(table, undefined)).toBe('initial');
    expect(
      lookupSumsubStatus(table, 'completed', { reviewAnswer: 'BLUE' } as never),
    ).toBe('pending');
    expect(
      lookupSumsubStatus(table, 'completed', {
        reviewAnswer: 'RED',
        reviewRejectType: 'SOMETHING' as never,
      }),
    ).toBe('declined');
  });

  it('is embedded in the page as JSON, with no second implementation of the rules', () => {
    const html = renderSumsubPage(params);
    expect(html).toContain(
      JSON.stringify(SUMSUB_STATUS_TABLE).replace(/</g, '\\u003c'),
    );
    expect(html).toContain('function mapStatus(');
    expect(html).not.toContain("=== 'GREEN'");
    expect(html).not.toContain('reviewRejectType ===');
  });
});
