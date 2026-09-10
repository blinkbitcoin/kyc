// The Express router: HTTP semantics of the kyc endpoints over the mock
// provider and the in-memory domain. The host's rate limits arrive as
// options; the router owns status codes, bodies and the page headers.

import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { createKycRouter, type KycRouterOptions } from '../express';
import { createMockProvider } from '../providers/mock/provider';
import { createVerificationService } from '../sessions';
import { createMemorySessionStore } from '../store';

const silent = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

const build = (overrides: Partial<KycRouterOptions> = {}) => {
  const store = createMemorySessionStore();
  const provider = createMockProvider({
    publicBaseUrl: () => 'https://kyc.example.com',
  });
  const sessions = createVerificationService({
    provider,
    providerName: 'mock',
    store,
    publicBaseUrl: () => 'https://kyc.example.com',
    logger: silent,
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  const app = express();
  // What an app-wide helmet() would set, and the page must drop
  app.use((_req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });
  app.use(
    createKycRouter({
      sessions,
      provider,
      providerName: 'mock',
      logger: silent,
      ...overrides,
    }),
  );
  return { app, store, sessions, provider };
};

describe('GET /health', () => {
  it('answers ok with a timestamp', async () => {
    const response = await request(build().app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
  });
});

describe('GET /hosted/:sessionId', () => {
  it('renders the provider page with a nonce CSP and the page headers, dropping the API ones', async () => {
    const { app, sessions } = build();
    await sessions.start('user-1', { platform: 'WEB' });
    const response = await request(app).get('/hosted/id-1');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toBe(
      'camera=(self), microphone=(self)',
    );
    expect(response.headers['x-frame-options']).toBeUndefined();
    expect(response.headers['cross-origin-opener-policy']).toBeUndefined();
    const nonce = /'nonce-([^']+)'/.exec(
      response.headers['content-security-policy'],
    )![1];
    expect(response.text).toContain(`nonce="${nonce}"`);
    expect(response.text).toContain('id="mock-approve"');
    expect(response.text).toContain('X-Mock-Signature');
  });

  it('404s with the sessionExpired page for an unknown or terminal session', async () => {
    const { app, sessions } = build();
    const unknown = await request(app).get('/hosted/nope');
    expect(unknown.status).toBe(404);
    expect(unknown.text).toContain("post('sessionExpired')");
    await sessions.start('user-1', { platform: 'WEB' });
    await sessions.applyStatusTransition('id-1', 'approved', 'webhook');
    expect((await request(app).get('/hosted/id-1')).status).toBe(404);
  });

  it('502s when the provider cannot mint a token', async () => {
    const { app, sessions, provider } = build();
    await sessions.start('user-1', { platform: 'WEB' });
    jest
      .spyOn(provider, 'refreshToken')
      .mockRejectedValueOnce(new Error('provider down'));
    expect((await request(app).get('/hosted/id-1')).status).toBe(502);
  });

  it('runs the host middleware', async () => {
    const seen: string[] = [];
    const tag =
      (name: string): RequestHandler =>
      (_req, _res, next) => {
        seen.push(name);
        next();
      };
    const { app } = build({
      middleware: { hosted: [tag('limit')], webhook: [tag('webhook-limit')] },
    });
    await request(app).get('/hosted/nope');
    await request(app)
      .post('/webhook/kyc/mock')
      .set('content-type', 'application/json')
      .send('{}');
    expect(seen).toEqual(['limit', 'webhook-limit']);
  });
});

describe('POST /webhook/kyc/:provider', () => {
  const signed = async (
    app: express.Express,
    provider: ReturnType<typeof createMockProvider>,
    body: string,
  ) =>
    request(app)
      .post('/webhook/kyc/mock')
      .set('content-type', 'application/json')
      .set('x-mock-signature', provider.signWebhook(body))
      .send(body);

  it('404s for a provider other than the configured one', async () => {
    const { app } = build();
    expect(
      (await request(app).post('/webhook/kyc/sumsub').send('{}')).status,
    ).toBe(404);
    expect(
      (await request(app).post('/webhook/kyc/constructor').send('{}')).status,
    ).toBe(404);
  });

  it('verifies the raw body, parses and applies the event', async () => {
    const { app, sessions, store, provider } = build();
    await sessions.start('user-1', { platform: 'WEB' });
    const applicantId = (await store.getSessionById('id-1'))!
      .providerApplicantId!;
    const response = await signed(
      app,
      provider,
      JSON.stringify({ applicantId, status: 'approved' }),
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, outcome: 'updated' });
    expect((await store.getSessionById('id-1'))?.status).toBe('approved');
  });

  it('401s without a valid signature, 400 on a payload the provider cannot parse', async () => {
    const { app, provider } = build();
    expect(
      (
        await request(app)
          .post('/webhook/kyc/mock')
          .set('content-type', 'application/json')
          .set('x-mock-signature', 'bad')
          .send('{}')
      ).status,
    ).toBe(401);
    expect((await signed(app, provider, '{')).status).toBe(400);
  });

  it('treats a non-text body (wrong content type) as an empty raw body', async () => {
    const { app, provider } = build();
    const spy = jest.spyOn(provider, 'verifyWebhook');
    await request(app)
      .post('/webhook/kyc/mock')
      .set('content-type', 'text/plain')
      .set('x-mock-signature', 'x')
      .send('x');
    expect(spy).toHaveBeenCalledWith(expect.anything(), '', expect.any(String));
  });

  it('500s when processing fails so the provider retries, and honours the body limit', async () => {
    const { app, sessions, store, provider } = build({ bodyLimit: '1kb' });
    await sessions.start('user-1', { platform: 'WEB' });
    const applicantId = (await store.getSessionById('id-1'))!
      .providerApplicantId!;
    jest
      .spyOn(store, 'getSessionByProviderApplicantId')
      .mockRejectedValueOnce(new Error('db down'));
    const failed = await signed(
      app,
      provider,
      JSON.stringify({ applicantId, status: 'approved' }),
    );
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: 'Processing failed' });
    const tooBig = await signed(
      app,
      provider,
      JSON.stringify({ applicantId, pad: 'x'.repeat(2000) }),
    );
    expect(tooBig.status).toBe(413);
  });
});
