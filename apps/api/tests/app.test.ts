import type { Express } from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../src/app';

describe('createApp', () => {
  let app: Express;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCors = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCors === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = originalCors;
    vi.restoreAllMocks();
  });

  it('serves GET /health', async () => {
    app = await createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('answers the health query over GraphQL with an unauthenticated context', async () => {
    app = await createApp();
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ health { status timestamp } }' });
    expect(res.status).toBe(200);
    expect(res.body.data.health.status).toBe('ok');
  });

  it('tags the active span with the user id when a bearer token is present', async () => {
    // Insecure-dev passthrough (tests/setup.ts): the bearer token IS the userId.
    const { trace } = await import('@opentelemetry/api');
    const setAttributes = vi.fn();
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ setAttributes } as never);
    app = await createApp();
    await request(app)
      .post('/graphql')
      .set('authorization', 'Bearer user-42')
      .send({ query: '{ health { status } }' });
    expect(setAttributes).toHaveBeenCalledWith({ 'enduser.id': 'user-42' });
  });

  it('honours CORS_ALLOWED_ORIGINS on /graphql', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example';
    app = await createApp();
    const res = await request(app)
      .post('/graphql')
      .set('origin', 'https://allowed.example')
      .send({ query: '{ health { status } }' });
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example');
  });

  it('trusts the first proxy and disables introspection in production', async () => {
    process.env.NODE_ENV = 'production';
    app = await createApp();
    expect(app.get('trust proxy')).toBe(1);
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ __schema { queryType { name } } }' });
    expect(res.body.errors?.[0]?.message).toMatch(/introspection/i);
  });
});

describe('GET /hosted/:sessionId', () => {
  it('renders the mock page with a nonce CSP and camera permissions', async () => {
    const session = await import('../src/session');
    const { clearApplicants } = await import('../src/providers/mock');
    clearApplicants();
    vi.spyOn(session, 'getSessionById').mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      provider: 'mock',
      providerApplicantId: 'mock-applicant-1',
      levelName: null,
      platform: 'WEB',
      status: 'initial',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const app = await createApp();
    const res = await request(app).get('/hosted/session-1');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.headers['permissions-policy']).toContain('camera=(self "https://api.sumsub.com")');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-frame-options']).toBeUndefined();
    const nonce = res.headers['content-security-policy'].match(/'nonce-([^']+)'/)![1];
    expect(res.text).toContain(`nonce="${nonce}"`);
    expect(res.text).toContain('id="mock-approve"');
    expect(res.text).toContain('X-Mock-Signature');
  });

  it('404s with the sessionExpired page for an unknown session', async () => {
    const session = await import('../src/session');
    vi.spyOn(session, 'getSessionById').mockResolvedValue(null);
    const app = await createApp();
    const res = await request(app).get('/hosted/nope');
    expect(res.status).toBe(404);
    expect(res.text).toContain("post('sessionExpired')");
  });

  it('502s when the provider cannot mint a token', async () => {
    const session = await import('../src/session');
    const providers = await import('../src/providers');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(session, 'getSessionById').mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      provider: 'mock',
      providerApplicantId: null,
      levelName: null,
      platform: 'WEB',
      status: 'initial',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.spyOn(providers.provider, 'refreshToken').mockRejectedValue(new Error('provider down'));

    const res = await request(await createApp()).get('/hosted/session-1');
    expect(res.status).toBe(502);
  });

  it('502s on a non-Error rejection from the provider', async () => {
    const session = await import('../src/session');
    const providers = await import('../src/providers');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(session, 'getSessionById').mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      provider: 'mock',
      providerApplicantId: null,
      levelName: null,
      platform: 'WEB',
      status: 'initial',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.spyOn(providers.provider, 'refreshToken').mockRejectedValue('boom');

    const res = await request(await createApp()).get('/hosted/session-1');
    expect(res.status).toBe(502);
  });

  it('renders successfully when the session has no bound applicant yet', async () => {
    const session = await import('../src/session');
    const providers = await import('../src/providers');
    const { clearApplicants } = await import('../src/providers/mock');
    clearApplicants();
    vi.spyOn(session, 'getSessionById').mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      provider: 'mock',
      providerApplicantId: null,
      levelName: null,
      platform: 'WEB',
      status: 'initial',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.spyOn(providers.provider, 'refreshToken').mockResolvedValue({ accessToken: 'mock-token-3' });

    const res = await request(await createApp()).get('/hosted/session-1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('unknown');
  });
});

describe('POST /webhook/kyc/:provider', () => {
  const body = JSON.stringify({ applicantId: 'mock-applicant-1', status: 'approved' });

  const send = async (path: string, signature?: string) =>
    request(await createApp())
      .post(path)
      .set('Content-Type', 'application/json')
      .set(signature === undefined ? {} : { 'X-Mock-Signature': signature })
      .send(body);

  it('404s for an unknown or non-configured provider', async () => {
    expect((await send('/webhook/kyc/docusign')).status).toBe(404);
    expect((await send('/webhook/kyc/sumsub')).status).toBe(404);
  });

  it('401s without a valid signature', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await send('/webhook/kyc/mock', 'bad')).status).toBe(401);
  });

  it('400s on a payload the provider cannot parse', async () => {
    const { signMockWebhook } = await import('../src/providers/mock');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(await createApp())
      .post('/webhook/kyc/mock')
      .set('Content-Type', 'application/json')
      .set('X-Mock-Signature', signMockWebhook('{'))
      .send('{');
    expect(res.status).toBe(400);
  });

  it('200s and reports the outcome for a valid webhook', async () => {
    const { signMockWebhook } = await import('../src/providers/mock');
    const webhook = await import('../src/webhook');
    vi.spyOn(webhook, 'handleWebhookEvent').mockResolvedValue('updated');
    const res = await send('/webhook/kyc/mock', signMockWebhook(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, outcome: 'updated' });
  });

  it('500s when processing throws', async () => {
    const { signMockWebhook } = await import('../src/providers/mock');
    const webhook = await import('../src/webhook');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(webhook, 'handleWebhookEvent').mockRejectedValue(new Error('db down'));
    expect((await send('/webhook/kyc/mock', signMockWebhook(body))).status).toBe(500);
  });

  it('500s with a non-Error rejection too', async () => {
    const { signMockWebhook } = await import('../src/providers/mock');
    const webhook = await import('../src/webhook');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(webhook, 'handleWebhookEvent').mockRejectedValue('db down');
    expect((await send('/webhook/kyc/mock', signMockWebhook(body))).status).toBe(500);
  });

  it('401s when the body was not parsed as JSON text (wrong content type)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(await createApp())
      .post('/webhook/kyc/mock')
      .set('Content-Type', 'text/plain')
      .set('X-Mock-Signature', 'whatever')
      .send(body);
    expect(res.status).toBe(401);
  });
});
