// The framework-neutral handlers: Fetch API Request → Response, the shape a
// serverless / route handler mounts directly. The decision logic they share
// with the Express router is exercised through them.

import { Errors } from '../errors';
import {
  createAccessTokenApp,
  createHostedPageHandler,
  createSessionRefreshHandler,
  createSessionStartHandler,
  createWebhookHandler,
  hostedPageHttp,
  mintAccessTokenHttp,
  processWebhookHttp,
  refreshSessionHttp,
  startSessionHttp,
} from '../handlers';
import type { VerificationProvider } from '../provider';
import { createMockProvider } from '../providers/mock/provider';
import { createVerificationService } from '../sessions';
import { createMemorySessionStore } from '../store';

const silent = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

const post = (
  url: string,
  body?: string,
  headers: Record<string, string> = {},
) => new Request(url, { method: 'POST', body, headers });

const setup = () => {
  const store = createMemorySessionStore();
  const provider = createMockProvider({
    publicBaseUrl: () => 'https://kyc.example.com',
    logger: silent,
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
  return { store, provider, sessions };
};

const authenticate = (request: Request) =>
  request.headers.get('authorization') === 'Bearer jwt' ? 'user-1' : null;

describe('createSessionStartHandler', () => {
  it('starts a session for an authenticated caller and returns what a source needs', async () => {
    const { sessions } = setup();
    const handler = createSessionStartHandler({
      sessions,
      authenticate,
      logger: silent,
    });
    const response = await handler(
      post(
        'https://x/verification/start',
        JSON.stringify({ platform: 'WEB', locale: 'en' }),
        {
          authorization: 'Bearer jwt',
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toMatchObject({
      sessionId: 'id-1',
      provider: 'mock',
      status: 'initial',
      url: 'https://kyc.example.com/hosted/id-1',
      allowedOrigin: 'https://kyc.example.com',
    });
  });

  it('maps the service errors: 401 without a user, 400 for a bad body, 400 for garbage', async () => {
    const { sessions } = setup();
    const handler = createSessionStartHandler({
      sessions,
      authenticate,
      logger: silent,
    });
    const anonymous = await handler(
      post('https://x/start', JSON.stringify({ platform: 'WEB' })),
    );
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ error: 'UNAUTHORIZED' });
    const bad = await handler(
      post('https://x/start', JSON.stringify({ platform: 'desktop' }), {
        authorization: 'Bearer jwt',
      }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    const garbage = await handler(
      post('https://x/start', 'not json', { authorization: 'Bearer jwt' }),
    );
    expect(garbage.status).toBe(400);
    expect(await garbage.json()).toEqual({ error: 'Invalid JSON body' });
    const empty = await handler(
      post('https://x/start', undefined, { authorization: 'Bearer jwt' }),
    );
    expect(empty.status).toBe(400);
  });

  it('answers 502 when the provider cannot mint, 500 for an unexpected failure', async () => {
    const { sessions, provider } = setup();
    const handler = createSessionStartHandler({
      sessions,
      authenticate: () => 'u',
      logger: silent,
    });
    jest
      .spyOn(provider, 'createSession')
      .mockRejectedValueOnce(new Error('sumsub down'));
    const unavailable = await handler(
      post('https://x/start', JSON.stringify({ platform: 'WEB' })),
    );
    expect(unavailable.status).toBe(502);
    expect(await unavailable.json()).toMatchObject({
      error: 'PROVIDER_UNAVAILABLE',
    });
    const broken = createSessionStartHandler({
      sessions: {
        start: async () => {
          throw new Error('bug');
        },
      },
      authenticate: () => 'u',
      logger: silent,
    });
    const failed = await broken(
      post('https://x/start', JSON.stringify({ platform: 'WEB' })),
    );
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'INTERNAL_ERROR' });
    expect(silent.error).toHaveBeenCalledWith(
      'Verification request failed:',
      'bug',
    );
  });
});

describe('createSessionRefreshHandler', () => {
  it('mints a replacement token for an owned session, 404 otherwise', async () => {
    const { sessions } = setup();
    await sessions.start('user-1', { platform: 'WEB' });
    const handler = createSessionRefreshHandler({
      sessions,
      authenticate,
      logger: silent,
    });
    const ok = await handler(
      post('https://x/refresh', JSON.stringify({ sessionId: 'id-1' }), {
        authorization: 'Bearer jwt',
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      accessToken: expect.stringMatching(/^mock-token-/),
    });
    const missing = await handler(
      post('https://x/refresh', JSON.stringify({ sessionId: 'nope' }), {
        authorization: 'Bearer jwt',
      }),
    );
    expect(missing.status).toBe(404);
    const blank = await handler(
      post('https://x/refresh', '{}', { authorization: 'Bearer jwt' }),
    );
    expect(blank.status).toBe(400);
    const garbage = await handler(
      post('https://x/refresh', '{', { authorization: 'Bearer jwt' }),
    );
    expect(garbage.status).toBe(400);
    expect(await garbage.json()).toEqual({ error: 'Invalid JSON body' });
  });
});

describe('createWebhookHandler', () => {
  it('passes headers, the raw body and the client ip to the provider and applies the event', async () => {
    const { sessions, provider, store } = setup();
    await sessions.start('user-1', { platform: 'WEB' });
    const applicantId = (await store.getSessionById('id-1'))!
      .providerApplicantId!;
    const handler = createWebhookHandler({
      provider,
      sessions,
      clientIp: request => request.headers.get('x-forwarded-for') ?? undefined,
      logger: silent,
    });
    const raw = JSON.stringify({ applicantId, status: 'approved' });
    const response = await handler(
      post('https://x/webhook/kyc/mock', raw, {
        'x-mock-signature': provider.signWebhook(raw),
        'x-forwarded-for': '10.0.0.9',
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      received: true,
      outcome: 'updated',
    });
    expect((await store.getSessionById('id-1'))?.status).toBe('approved');
  });

  it('answers 401, 400 and 500 on the failure paths (no clientIp → undefined ip)', async () => {
    const { sessions, provider } = setup();
    const handler = createWebhookHandler({
      provider,
      sessions,
      logger: silent,
    });
    expect((await handler(post('https://x/webhook', '{}'))).status).toBe(401);
    const spy = jest.spyOn(provider, 'verifyWebhook').mockReturnValue(true);
    expect((await handler(post('https://x/webhook', 'nope'))).status).toBe(400);
    expect(spy).toHaveBeenLastCalledWith(expect.anything(), 'nope', undefined);
    const failing = createWebhookHandler({
      provider,
      sessions: {
        handleWebhookEvent: async () => {
          throw new Error('db down');
        },
      },
      logger: silent,
    });
    const failed = await failing(
      post(
        'https://x/webhook',
        JSON.stringify({ applicantId: 'a', status: 'approved' }),
      ),
    );
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'Processing failed' });
    expect(silent.error).toHaveBeenCalledWith(
      'Webhook processing error:',
      'db down',
    );
    const odd = createWebhookHandler({
      provider,
      sessions: {
        handleWebhookEvent: async () => {
          throw 'weird';
        },
      },
      logger: silent,
    });
    await odd(
      post(
        'https://x/webhook',
        JSON.stringify({ applicantId: 'a', status: 'approved' }),
      ),
    );
    expect(silent.error).toHaveBeenLastCalledWith(
      'Webhook processing error:',
      'weird',
    );
  });

  it('answers 401 rather than 500 when the verifier throws, logging it', async () => {
    const { sessions, provider } = setup();
    jest.spyOn(provider, 'verifyWebhook').mockImplementationOnce(() => {
      throw new Error('bad header');
    });
    const handler = createWebhookHandler({
      provider,
      sessions,
      logger: silent,
    });
    expect((await handler(post('https://x/webhook', '{}'))).status).toBe(401);
    expect(silent.error).toHaveBeenCalledWith(
      'Webhook signature verification error:',
      'bad header',
    );
    jest.spyOn(provider, 'verifyWebhook').mockImplementationOnce(() => {
      throw 'odd';
    });
    expect((await handler(post('https://x/webhook', '{}'))).status).toBe(401);
    expect(silent.error).toHaveBeenLastCalledWith(
      'Webhook signature verification error:',
      'odd',
    );
  });
});

describe('createHostedPageHandler', () => {
  it('serves the provider page under its headers, with a token minted for the render', async () => {
    const { sessions, provider } = setup();
    await sessions.start('user-1', { platform: 'WEB', locale: 'en' });
    const handler = createHostedPageHandler({ sessions, provider });
    const response = await handler(new Request('https://x/hosted/id-1'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('permissions-policy')).toBe(
      'camera=(self), microphone=(self)',
    );
    const csp = response.headers.get('content-security-policy')!;
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    const html = await response.text();
    expect(html).toContain(`nonce="${nonce}"`);
    expect(html).toContain('id="mock-approve"');
    expect(html).toContain('https://kyc.example.com/webhook/kyc/mock');
  });

  it('serves the not-found page as 404 for an unknown session and takes a custom session id', async () => {
    const { sessions, provider } = setup();
    const handler = createHostedPageHandler({
      sessions,
      provider,
      sessionId: request => new URL(request.url).searchParams.get('s') ?? '',
    });
    const response = await handler(new Request('https://x/hosted?s=nope'));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("post('sessionExpired')");
    const trailing = await createHostedPageHandler({ sessions, provider })(
      new Request('https://x/'),
    );
    expect(trailing.status).toBe(404);
  });
});

describe('hostedPageHttp', () => {
  it('uses the provider page headers, and the defaults for a provider without a page', async () => {
    const { sessions, provider } = setup();
    await sessions.start('user-1', { platform: 'WEB' });
    const themed: VerificationProvider = {
      ...provider,
      hostedPage: {
        render: params =>
          `<page ${params.sessionId} ${params.userId} ${params.applicantId}>`,
        csp: nonce => `custom ${nonce}`,
        permissionsPolicy: 'camera=()',
      },
    };
    const page = await hostedPageHttp({
      sessionId: 'id-1',
      sessions,
      provider: themed,
      nonce: 'n',
    });
    expect(page).toMatchObject({
      status: 200,
      html: expect.stringMatching(/^<page id-1 user-1 mock-applicant-/),
      nonce: 'n',
      headers: {
        'Content-Security-Policy': 'custom n',
        'Permissions-Policy': 'camera=()',
      },
    });
    const pageless = await hostedPageHttp({
      sessionId: 'id-1',
      sessions,
      provider: {},
    });
    expect(pageless.status).toBe(404);
    expect(pageless.headers['Permissions-Policy']).toBe(
      'camera=(self), microphone=(self)',
    );
    expect(pageless.headers['Content-Security-Policy']).toContain(
      `'nonce-${pageless.nonce}'`,
    );
  });

  it('omits the applicant and locale for a session that has neither', async () => {
    const { sessions, provider } = setup();
    jest
      .spyOn(provider, 'createSession')
      .mockResolvedValueOnce({ accessToken: 't' });
    await sessions.start('user-1', { platform: 'WEB' });
    const bare: VerificationProvider = {
      ...provider,
      hostedPage: { render: params => JSON.stringify(params) },
    };
    const page = await hostedPageHttp({
      sessionId: 'id-1',
      sessions,
      provider: bare,
      nonce: 'n',
    });
    expect(JSON.parse(page.html)).toEqual({
      sessionId: 'id-1',
      userId: 'user-1',
      accessToken: expect.stringMatching(/^mock-token-/),
      nonce: 'n',
    });
  });

  it('is a 502 when the token cannot be minted', async () => {
    const { sessions, provider } = setup();
    await sessions.start('user-1', { platform: 'WEB' });
    jest
      .spyOn(provider, 'refreshToken')
      .mockRejectedValueOnce(new Error('down'));
    const page = await hostedPageHttp({
      sessionId: 'id-1',
      sessions,
      provider,
    });
    expect(page.status).toBe(502);
    expect(page.html).toContain("post('sessionExpired')");
  });
});

describe('the shared decision functions default to the console logger', () => {
  it('log through console when no logger is given', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await startSessionHttp({
      userId: 'u',
      body: {},
      sessions: {
        start: async () => {
          throw 'x';
        },
      },
    });
    await refreshSessionHttp({
      userId: 'u',
      body: {},
      sessions: {
        refresh: async () => {
          throw new Error('y');
        },
      },
    });
    await processWebhookHttp({
      provider: { verifyWebhook: () => true, parseWebhookEvent: () => null },
      sessions: { handleWebhookEvent: async () => 'updated' },
      headers: {},
      rawBody: '',
    });
    expect(errorSpy).toHaveBeenCalledWith('Verification request failed:', 'x');
    expect(errorSpy).toHaveBeenCalledWith('Verification request failed:', 'y');
    expect(errorSpy).toHaveBeenCalledWith('Webhook error: invalid payload');
    errorSpy.mockRestore();
  });
});

describe('mintAccessTokenHttp', () => {
  const provider = createMockProvider({
    publicBaseUrl: () => 'https://kyc.example.com',
    logger: silent,
  });

  it('mints one token for the caller with no session stored', async () => {
    const result = await mintAccessTokenHttp({
      userId: 'user-1',
      body: { platform: 'IOS', levelName: 'basic' },
      provider,
      logger: silent,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      accessToken: expect.stringMatching(/^mock-token-/),
      providerApplicantId: expect.stringMatching(/^mock-applicant-/),
    });
  });

  it('answers 401 unauthenticated and 400 on bad input', async () => {
    // No logger given: the console one is the default, and a 401 logs nothing
    expect(
      await mintAccessTokenHttp({
        userId: null,
        body: { platform: 'IOS' },
        provider,
      }),
    ).toMatchObject({ status: 401, body: { error: 'UNAUTHORIZED' } });
    expect(
      await mintAccessTokenHttp({
        userId: 'user-1',
        body: { platform: 'TV' },
        provider,
        logger: silent,
      }),
    ).toMatchObject({ status: 400, body: { error: 'VALIDATION_ERROR' } });
  });

  it('lets the host pick the level from its own data, and refuse with a 400', async () => {
    const createSession = jest.fn(async () => ({ accessToken: 't' }));
    const levelFor = jest.fn(async (_input, context) =>
      context.tier === 'gold' ? 'enhanced' : undefined,
    );
    const result = await mintAccessTokenHttp({
      userId: 'user-1',
      body: { platform: 'WEB', levelName: 'client-says-basic', locale: 'en' },
      provider: { createSession },
      levelFor,
      context: { tier: 'gold' },
      logger: silent,
    });
    expect(result).toEqual({
      status: 200,
      body: {
        accessToken: 't',
        expiresAt: undefined,
        providerApplicantId: undefined,
      },
    });
    expect(levelFor).toHaveBeenCalledWith(
      { platform: 'WEB', levelName: 'client-says-basic', locale: 'en' },
      { userId: 'user-1', tier: 'gold' },
    );
    expect(createSession).toHaveBeenCalledWith('user-1', {
      platform: 'WEB',
      levelName: 'enhanced',
      locale: 'en',
    });
    expect(
      await mintAccessTokenHttp({
        userId: 'user-1',
        body: { platform: 'WEB' },
        provider: { createSession },
        levelFor: () => {
          throw Errors.validationError('no level for this user');
        },
        logger: silent,
      }),
    ).toMatchObject({
      status: 400,
      body: { error: 'VALIDATION_ERROR', message: 'no level for this user' },
    });
  });

  it('answers 502 when the provider cannot mint, keeping a coded error', async () => {
    const down = await mintAccessTokenHttp({
      userId: 'user-1',
      body: { platform: 'WEB' },
      provider: {
        createSession: async () => {
          throw new Error('network');
        },
      },
      logger: silent,
    });
    expect(down).toMatchObject({
      status: 502,
      body: { error: 'PROVIDER_UNAVAILABLE' },
    });
    expect(silent.error).toHaveBeenCalledWith(
      'Access token mint failed:',
      'network',
    );
    const coded = await mintAccessTokenHttp({
      userId: 'user-1',
      body: { platform: 'WEB' },
      provider: {
        createSession: async () => {
          throw Errors.sessionCreationFailed('quota');
        },
      },
      logger: silent,
    });
    expect(coded).toMatchObject({
      status: 502,
      body: { error: 'SESSION_CREATION_FAILED', message: 'quota' },
    });
    const raw = await mintAccessTokenHttp({
      userId: 'user-1',
      body: { platform: 'WEB' },
      provider: {
        createSession: async () => {
          throw 'boom';
        },
      },
      logger: silent,
    });
    expect(raw.status).toBe(502);
    expect(silent.error).toHaveBeenCalledWith(
      'Access token mint failed:',
      'boom',
    );
  });
});

describe('createAccessTokenApp', () => {
  const provider = createMockProvider({
    publicBaseUrl: () => 'https://kyc.example.com',
    logger: silent,
  });
  const app = (overrides = {}) =>
    createAccessTokenApp({
      provider,
      authenticate,
      logger: silent,
      ...overrides,
    });
  const mint = (body: string | undefined, headers = {}) =>
    post('https://api.example.com/verification/token', body, headers);

  it('serves the mint endpoint, a health check and nothing else', async () => {
    const { fetch } = app();
    const minted = await fetch(
      mint(JSON.stringify({ platform: 'ANDROID' }), {
        authorization: 'Bearer jwt',
      }),
    );
    expect(minted.status).toBe(200);
    expect(minted.headers.get('content-type')).toBe('application/json');
    expect(await minted.json()).toMatchObject({
      accessToken: expect.stringMatching(/^mock-token-/),
    });
    expect(
      (await fetch(mint('{', { authorization: 'Bearer jwt' }))).status,
    ).toBe(400);
    expect(
      (await fetch(mint(JSON.stringify({ platform: 'WEB' })))).status,
    ).toBe(401);
    const health = await fetch(new Request('https://api.example.com/health'));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
    expect(
      (await fetch(new Request('https://api.example.com/verification/x')))
        .status,
    ).toBe(404);
    expect(
      (await fetch(new Request('https://api.example.com/health'))).status,
    ).toBe(200);
  });

  it('takes another path and turns the health check off', async () => {
    const { fetch } = app({ path: '/token', health: false });
    expect(
      (
        await fetch(
          post(
            'https://api.example.com/token',
            JSON.stringify({ platform: 'WEB' }),
            { authorization: 'Bearer jwt' },
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (await fetch(new Request('https://api.example.com/health'))).status,
    ).toBe(404);
  });

  it('hands the hook the request, so the level can come from the host session', async () => {
    const levelFor = jest.fn(
      (_input, { request, userId }) =>
        `${userId}:${request.headers.get('x-tier')}`,
    );
    const createSession = jest.fn(async () => ({ accessToken: 't' }));
    const { fetch } = createAccessTokenApp({
      provider: { createSession },
      authenticate,
      levelFor,
      logger: silent,
    });
    await fetch(
      mint(JSON.stringify({ platform: 'WEB' }), {
        authorization: 'Bearer jwt',
        'x-tier': 'gold',
      }),
    );
    expect(createSession).toHaveBeenCalledWith('user-1', {
      platform: 'WEB',
      levelName: 'user-1:gold',
      locale: undefined,
    });
  });

  it('answers the CORS preflight and marks the mint for an allowed origin only', async () => {
    const { fetch } = app({ cors: { origins: ['https://app.example.com'] } });
    const preflight = await fetch(
      new Request('https://api.example.com/verification/token', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.com' },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    );
    expect(preflight.headers.get('access-control-allow-methods')).toBe(
      'POST, OPTIONS',
    );
    const allowed = await fetch(
      mint(JSON.stringify({ platform: 'WEB' }), {
        authorization: 'Bearer jwt',
        origin: 'https://app.example.com',
      }),
    );
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    );
    expect(allowed.headers.get('vary')).toBe('origin');
    const other = await fetch(
      mint(JSON.stringify({ platform: 'WEB' }), {
        authorization: 'Bearer jwt',
        origin: 'https://evil.example.com',
      }),
    );
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect(other.headers.get('vary')).toBe('origin');
    const noOrigin = await fetch(
      mint(JSON.stringify({ platform: 'WEB' }), {
        authorization: 'Bearer jwt',
      }),
    );
    expect(noOrigin.headers.get('access-control-allow-origin')).toBeNull();
    expect(noOrigin.headers.get('vary')).toBe('origin');
    const bad = await fetch(
      mint('{', {
        authorization: 'Bearer jwt',
        origin: 'https://app.example.com',
      }),
    );
    expect(bad.status).toBe(400);
    expect(bad.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com',
    );
    // No CORS configured: OPTIONS is just another unknown request
    expect(
      (
        await app().fetch(
          new Request('https://api.example.com/verification/token', {
            method: 'OPTIONS',
          }),
        )
      ).status,
    ).toBe(404);
    // Any origin
    const any = await app({ cors: { origins: ['*'] } }).fetch(
      mint(JSON.stringify({ platform: 'WEB' }), {
        authorization: 'Bearer jwt',
        origin: 'https://anyone.example.com',
      }),
    );
    expect(any.headers.get('access-control-allow-origin')).toBe('*');
  });
});
