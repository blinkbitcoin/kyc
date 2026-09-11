// The Fetch core: which routes exist for which capabilities, what the boot
// guard refuses, and the policy (auth, CORS, security headers) around them.
//
// The sessions half runs against the real verification domain over an
// in-memory store (no Postgres): "processed" is asserted on the stored
// status and the audit trail, never on a mocked repository call.

import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

vi.mock('../src/store', async () => {
  const { memoryStore } = await import('./support/store');
  return { createStore: vi.fn(() => memoryStore) };
});

import { createKycApp } from '../src/app';
import { createMock, signMockWebhook } from '../src/providers/mock';
import { createStore } from '../src/store';
import { asJson, get, options, post, silently, testApp, testFullApp } from './support/app';
import { memoryStore as store } from './support/store';

const authHeaders = { authorization: 'Bearer user-1' };
const MOCK_ENV = { ALLOW_INSECURE_DEV: 'true', MOCK_WEBHOOK_SECRET: 'mock' };

// A persisted session the webhook may advance, and the page may render
const seedSession = (overrides: { status?: 'initial' | 'pending'; applicantId?: string } = {}) =>
  store.createSession({
    id: randomUUID(),
    userId: 'user-1',
    provider: 'mock',
    platform: 'WEB',
    providerApplicantId: overrides.applicantId ?? `mock-applicant-${randomUUID()}`,
  });

describe('capabilities', () => {
  it('reports tokens alone without DATABASE_URL', async () => {
    const app = testApp();
    expect(app.capabilities).toEqual(['tokens']);

    const body = await asJson(await get(app, '/health'));
    expect(body).toMatchObject({ status: 'ok', capabilities: ['tokens'] });
    expect(body).toHaveProperty('timestamp');
  });

  it('adds sessions with DATABASE_URL', async () => {
    const app = testFullApp();
    expect(app.capabilities).toEqual(['tokens', 'sessions']);

    expect(await asJson(await get(app, '/health'))).toMatchObject({
      capabilities: ['tokens', 'sessions'],
    });
    await app.stop();
  });

  it('builds the session store from the env it was handed, not from process.env', async () => {
    // The whole point of the env object: an app constructed with a
    // DATABASE_URL that is not process.env's must connect to that one
    const injected = 'postgresql://injected:injected@db.internal:5432/kyc';
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://wrong:wrong@elsewhere:9999/wrong';
    vi.mocked(createStore).mockClear();
    try {
      const app = testFullApp({ DATABASE_URL: injected });
      // The capability (and with it the store) is built lazily, on the first
      // request that needs it
      await silently(() => post(app, '/webhook/kyc/mock', '{}'));

      expect(vi.mocked(createStore)).toHaveBeenCalledWith(
        expect.objectContaining({ DATABASE_URL: injected })
      );
      await app.stop();
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });

  it('has no webhook, no GraphQL and no hosted route without a database', async () => {
    const app = testApp();

    expect((await post(app, '/webhook/kyc/mock', '{}')).status).toBe(404);
    expect((await post(app, '/graphql', { query: '{ __typename }' })).status).toBe(404);
    expect((await get(app, '/hosted/some-session')).status).toBe(404);
  });

  it('answers 404 for anything it does not serve', async () => {
    const response = await get(testApp(), '/nope');

    expect(response.status).toBe(404);
    expect(await asJson(response)).toEqual({ error: 'Not found' });
  });

  it('refuses to construct when the configuration is wrong', () => {
    expect(() => createKycApp({ KYC_PROVIDER: 'mock' })).toThrow(/Refusing to start/);
  });

  it('refuses a database it was not built to serve (no sessions module)', async () => {
    // What the Cloudflare entry does: it passes no loader, so sessions are
    // not something this target can offer at all
    await silently(() =>
      expect(() =>
        createKycApp({
          ALLOW_INSECURE_DEV: 'true',
          KYC_PROVIDER: 'mock',
          DATABASE_URL: 'postgres://u@h/db',
        })
      ).toThrow(/without the sessions module/)
    );
  });

  it('refuses sessions on the edge runtime', () => {
    expect(() =>
      createKycApp(
        { ALLOW_INSECURE_DEV: 'true', KYC_PROVIDER: 'mock', DATABASE_URL: 'postgres://u@h/db' },
        { runtime: 'edge' }
      )
    ).toThrow(/cannot open a Postgres connection/);
  });
});

describe('the token mint', () => {
  it('mints for an authenticated caller', async () => {
    const response = await post(testApp(), '/verification/token', { platform: 'IOS' }, authHeaders);

    expect(response.status).toBe(200);
    expect(await asJson(response)).toMatchObject({
      accessToken: expect.stringMatching(/^mock-token-/),
    });
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await post(testApp(), '/verification/token', { platform: 'IOS' });

    expect(response.status).toBe(401);
    expect(await asJson(response)).toMatchObject({ error: 'UNAUTHORIZED' });
  });

  it('verifies the session rather than trusting the token, when a secret is configured', async () => {
    // Outside insecure dev the mock is refused too, so this is a Sumsub
    // deployment with the settings a mint needs (dummy values)
    const app = testApp({
      ALLOW_INSECURE_DEV: undefined,
      SESSION_HS256_SECRET: 'a-secret',
      KYC_PROVIDER: 'sumsub',
      SUMSUB_APP_TOKEN: 'app',
      SUMSUB_SECRET_KEY: 'key',
    });

    const response = await post(app, '/verification/token', { platform: 'IOS' }, authHeaders);
    expect(response.status).toBe(401);
  });

  it('runs on an injected provider, under the name the deployment gives it', async () => {
    const createSession = vi.fn(async () => ({ accessToken: 'injected' }));
    const app = testApp({}, { provider: { createSession } as never, providerName: 'own' });

    const response = await post(app, '/verification/token', { platform: 'WEB' }, authHeaders);
    expect(await asJson(response)).toMatchObject({ accessToken: 'injected' });
    expect(createSession).toHaveBeenCalledWith('user-1', {
      platform: 'WEB',
      levelName: undefined,
      locale: undefined,
    });
    // The name defaults to KYC_PROVIDER, then to the mock
    expect(
      testApp({ KYC_PROVIDER: undefined }, { provider: { createSession } as never })
    ).toBeDefined();
  });
});

describe('CORS', () => {
  const CORS_ALLOWED_ORIGINS = 'https://app.example.com';

  it('answers the token preflight for an allow-listed origin', async () => {
    const response = await options(testApp({ CORS_ALLOWED_ORIGINS }), '/verification/token', {
      origin: 'https://app.example.com',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('answers the GraphQL preflight and marks the answer', async () => {
    const app = testFullApp({ CORS_ALLOWED_ORIGINS });

    const preflight = await options(app, '/graphql', { origin: 'https://app.example.com' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.example.com');

    const query = await post(
      app,
      '/graphql',
      { query: '{ __typename }' },
      { origin: 'https://app.example.com' }
    );
    expect(query.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    await app.stop();
  });

  it('does not mark an answer for an origin outside the list', async () => {
    const response = await get(testApp({ CORS_ALLOWED_ORIGINS }), '/health', {
      origin: 'https://evil.example.com',
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBe('origin');
  });

  it('varies on origin even when the caller sent none', async () => {
    const response = await get(testApp({ CORS_ALLOWED_ORIGINS }), '/health');
    expect(response.headers.get('vary')).toBe('origin');
  });

  it('allows any origin with a wildcard', async () => {
    const response = await get(testApp({ CORS_ALLOWED_ORIGINS: '*' }), '/health', {
      origin: 'https://anywhere.example.com',
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('marks nothing when no origins are configured', async () => {
    const response = await get(testApp(), '/health', { origin: 'https://app.example.com' });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBeNull();
  });
});

describe('security headers', () => {
  it('sets the fail-closed baseline on JSON routes', async () => {
    const response = await get(testApp(), '/health');

    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none';frame-ancestors 'none'"
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('strict-transport-security')).toContain('max-age=');
  });
});

describe('the hosted page', () => {
  let app: ReturnType<typeof testFullApp>;

  beforeAll(() => {
    app = testFullApp(MOCK_ENV);
  });

  afterAll(async () => {
    await app.stop();
  });

  it('renders the provider page for a stored session, embeddable, under its own policy', async () => {
    const session = await seedSession();
    const response = await get(app, `/hosted/${session.id}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    // The page exists to be embedded: no frame denial, no cross-origin isolation
    expect(response.headers.get('x-frame-options')).toBeNull();
    expect(response.headers.get('cross-origin-resource-policy')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('permissions-policy')).toContain('camera=');
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain('frame-ancestors *');
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    const html = await response.text();
    expect(html).toContain(`nonce="${nonce}"`);
    expect(html).toContain('id="mock-approve"');
  });

  it('404s with the sessionExpired page for an unknown session', async () => {
    const response = await get(app, '/hosted/nope');
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("post('sessionExpired')");
  });
});

describe('the provider webhook', () => {
  let app: ReturnType<typeof testFullApp>;
  let errors: ReturnType<typeof vi.spyOn>;
  let logs: ReturnType<typeof vi.spyOn>;
  let warns: ReturnType<typeof vi.spyOn>;

  const payload = (applicantId: string, status: string) => JSON.stringify({ applicantId, status });

  const signed = (body: string) =>
    post(app, '/webhook/kyc/mock', body, { 'x-mock-signature': signMockWebhook(body, MOCK_ENV) });

  beforeAll(() => {
    app = testFullApp(MOCK_ENV);
  });

  afterAll(async () => {
    await app.stop();
  });

  // The security-event logging on a bad signature, the "unknown session"
  // warning and the processed-webhook log are expected here. The service
  // composes the package on the console and has no seam of its own, so this
  // suite opts out of the silent-tests gate (vitest.setup.ts) by spying on
  // the console itself - per test, so the spy sits on top of the gate's,
  // never underneath it.
  beforeEach(() => {
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errors.mockRestore();
    logs.mockRestore();
    warns.mockRestore();
  });

  it('accepts deliveries from the configured provider only', async () => {
    const response = await post(app, '/webhook/kyc/sumsub', payload('a', 'approved'));
    expect(response.status).toBe(404);
    expect(await asJson(response)).toEqual({ error: 'Unknown provider' });
  });

  it('refuses an invalid or missing signature, touching nothing', async () => {
    const session = await seedSession();
    const body = payload(session.providerApplicantId as string, 'approved');

    const bad = await post(app, '/webhook/kyc/mock', body, { 'x-mock-signature': 'bad' });
    expect(bad.status).toBe(401);
    expect((await post(app, '/webhook/kyc/mock', body)).status).toBe(401);
    expect((await store.getSessionById(session.id))?.status).toBe('initial');
  });

  it('processes a signed event: status and audit trail', async () => {
    const session = await seedSession();

    const response = await signed(payload(session.providerApplicantId as string, 'approved'));

    expect(response.status).toBe(200);
    expect(await asJson(response)).toEqual({ received: true, outcome: 'updated' });
    expect((await store.getSessionById(session.id))?.status).toBe('approved');
    const audit = await store.listAuditEntries(session.id);
    expect(audit.map((entry) => entry.action)).toEqual(['status_updated']);
  });

  it('acknowledges a signed event for a session it does not know', async () => {
    const response = await signed(payload(`mock-applicant-${randomUUID()}`, 'approved'));

    expect(response.status).toBe(200);
    expect(await asJson(response)).toEqual({ received: true, outcome: 'unknown_session' });
  });

  it('refuses an unparseable payload that carries a valid signature', async () => {
    const response = await signed('not valid json {{{');

    expect(response.status).toBe(400);
    expect(await asJson(response)).toEqual({ error: 'Invalid payload' });
  });

  it('logs the client a trusted proxy reports, and ignores one it does not trust', async () => {
    const trusting = testFullApp({ ...MOCK_ENV, TRUST_PROXY: 'true' });
    const body = payload('mock-applicant-x', 'approved');

    const response = await post(trusting, '/webhook/kyc/mock', body, {
      'x-mock-signature': 'bad',
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
    });
    expect(response.status).toBe(401);
    // The security log names the forwarded client, not the proxy
    expect(errors).toHaveBeenCalledWith(
      'Security event:',
      expect.stringContaining('"ip":"203.0.113.7"')
    );
    await trusting.stop();

    errors.mockClear();
    const untrusted = await post(app, '/webhook/kyc/mock', body, {
      'x-mock-signature': 'bad',
      'x-forwarded-for': '203.0.113.7',
    });
    expect(untrusted.status).toBe(401);
    expect(errors).not.toHaveBeenCalledWith(
      'Security event:',
      expect.stringContaining('203.0.113.7')
    );
  });
});

describe('the GraphQL API', () => {
  const START = `
    mutation Start($input: VerificationSessionStartInput!) {
      verificationSessionStart(input: $input) { sessionId status accessToken url allowedOrigin }
    }
  `;
  const STATUS = 'query Status($id: ID!) { verificationSession(id: $id) { sessionId status } }';

  let app: ReturnType<typeof testFullApp>;

  beforeAll(() => {
    app = testFullApp({ ...MOCK_ENV, PUBLIC_BASE_URL: 'https://kyc.example.com' });
  });

  afterAll(async () => {
    await app.stop();
  });

  it('answers the health query with an unauthenticated context', async () => {
    const response = await post(app, '/graphql', { query: '{ health { status } }' });

    expect(response.status).toBe(200);
    expect(await asJson(response)).toMatchObject({ data: { health: { status: 'ok' } } });
  });

  it('is unauthenticated without an Authorization header', async () => {
    const response = await post(app, '/graphql', {
      query: START,
      variables: { input: { platform: 'WEB' } },
    });

    const body = await asJson<{ errors: { extensions: { code: string } }[] }>(response);
    expect(body.errors[0].extensions.code).toBe('UNAUTHORIZED');
  });

  it('starts a session for the verified caller and reads it back, on the public base URL', async () => {
    const started = await asJson<{ data: { verificationSessionStart: Record<string, string> } }>(
      await post(
        app,
        '/graphql',
        { query: START, variables: { input: { platform: 'IOS' } } },
        authHeaders
      )
    );
    const session = started.data.verificationSessionStart;
    expect(session.accessToken).toMatch(/^mock-token-/);
    expect(session.url).toBe(`https://kyc.example.com/hosted/${session.sessionId}`);
    expect(session.allowedOrigin).toBe('https://kyc.example.com');

    const read = await asJson<{ data: { verificationSession: { status: string } } }>(
      await post(
        app,
        '/graphql',
        { query: STATUS, variables: { id: session.sessionId } },
        authHeaders
      )
    );
    expect(read.data.verificationSession.status).toBe('initial');
  });

  it('tags the active span with the caller', async () => {
    const { trace } = await import('@opentelemetry/api');
    const setAttributes = vi.fn();
    const active = vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ setAttributes } as never);
    await post(
      app,
      '/graphql',
      { query: '{ health { status } }' },
      { authorization: 'Bearer user-42' }
    );
    expect(setAttributes).toHaveBeenCalledWith({ 'enduser.id': 'user-42' });
    active.mockRestore();
  });

  it('answers 400 for a body that is not a GraphQL request', async () => {
    const response = await post(app, '/graphql', 'not json at all');
    expect(response.status).toBe(400);
  });

  it('serves the dev landing page on GET', async () => {
    const response = await get(app, '/graphql', { accept: 'text/html' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('allows introspection outside production', async () => {
    const response = await post(app, '/graphql', {
      query: '{ __schema { queryType { name } } }',
    });

    expect(await asJson<{ errors?: unknown }>(response)).not.toHaveProperty('errors');
  });

  it('disables introspection when KYC_ENV=production', async () => {
    const production = testFullApp({
      ...MOCK_ENV,
      KYC_ENV: 'production',
      KYC_ALLOW_DEMO: 'true',
      PUBLIC_BASE_URL: 'https://kyc.example.com',
    });

    const response = await post(production, '/graphql', {
      query: '{ __schema { queryType { name } } }',
    });

    expect(await asJson<{ errors?: unknown }>(response)).toHaveProperty('errors');
    await production.stop();
  });

  it('surfaces a failure to build the capability on the first request that needs it', async () => {
    const failing = testFullApp(
      {},
      {
        loadSessions: async () => {
          throw new Error('no database');
        },
      }
    );

    await expect(post(failing, '/graphql', { query: '{ __typename }' })).rejects.toThrow(
      'no database'
    );
    await expect(failing.stop()).rejects.toThrow('no database');
  });

  it('runs the resolvers on the very provider the mint uses', async () => {
    // A handle of this test's own: what it stores is what the page reads
    const mock = createMock(MOCK_ENV);
    const own = testFullApp(MOCK_ENV, { provider: mock, providerName: 'mock' });
    const started = await asJson<{ data: { verificationSessionStart: { sessionId: string } } }>(
      await post(
        own,
        '/graphql',
        { query: START, variables: { input: { platform: 'WEB' } } },
        authHeaders
      )
    );
    expect(
      (await get(own, `/hosted/${started.data.verificationSessionStart.sessionId}`)).status
    ).toBe(200);
    await own.stop();
  });
});
