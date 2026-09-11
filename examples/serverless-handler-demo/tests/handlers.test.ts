import { vi } from 'vitest';
import {
  authenticate,
  createApp,
  handlers,
  providerFromEnv,
} from '../src/handlers';

// Tests are silent (vitest.setup.ts): the package reports through the
// injected logger
const silent = { log() {}, warn() {}, error() {} };

const post = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`https://fn.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('authenticate', () => {
  it('takes the bearer token as the user id (a real host verifies its session here)', () => {
    const withAuth = (authorization?: string) =>
      new Request(
        'https://fn.example/x',
        authorization ? { headers: { authorization } } : {},
      );
    expect(authenticate(withAuth('Bearer user-1'))).toBe('user-1');
    expect(authenticate(withAuth('Basic x'))).toBeNull();
    expect(authenticate(withAuth())).toBeNull();
  });
});

describe('providerFromEnv', () => {
  it('is the mock provider when KYC_PROVIDER=mock', async () => {
    const provider = providerFromEnv(
      { KYC_PROVIDER: 'mock' },
      { logger: silent },
    );
    const session = await provider.createSession('u', { platform: 'IOS' });
    expect(session.accessToken).toMatch(/^mock-token-/);
  });

  it('is Sumsub otherwise, refusing to start without the app token and secret', () => {
    expect(() => providerFromEnv({}, { logger: silent })).toThrow(
      /SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY/,
    );
    // No webhook secret needed: this host receives none
    const provider = providerFromEnv(
      { SUMSUB_APP_TOKEN: 'app', SUMSUB_SECRET_KEY: 'key' },
      { logger: silent },
    );
    expect(typeof provider.getStatusByUserId).toBe('function');
  });

  it('refuses production on the sandbox token', () => {
    expect(() =>
      providerFromEnv({
        KYC_ENV: 'production',
        SUMSUB_APP_TOKEN: 'sbx:app',
        SUMSUB_SECRET_KEY: 'key',
      }),
    ).toThrow(/SUMSUB_APP_TOKEN=sbx:… is a demo setting/);
  });

  it('warns and stays on Sumsub for an unknown name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      providerFromEnv({ KYC_PROVIDER: 'onfido' }, { logger: silent }),
    ).toThrow(/SUMSUB_/);
    expect(warn).toHaveBeenCalledWith(
      'Unknown KYC_PROVIDER: onfido, falling back to sumsub',
    );
    warn.mockRestore();
  });
});

describe('createApp (mock provider)', () => {
  const app = createApp({ KYC_PROVIDER: 'mock' }, { logger: silent });

  it('mints an access token for an authenticated caller', async () => {
    const response = await app.fetch(
      post(
        '/verification/token',
        { platform: 'IOS', levelName: 'basic-kyc-level' },
        { authorization: 'Bearer user-1' },
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toMatch(/^mock-token-/);
    expect(body.providerApplicantId).toMatch(/^mock-applicant-/);
  });

  it('answers 401 without a session, 400 on bad input, 404 off its routes', async () => {
    expect(
      (await app.fetch(post('/verification/token', { platform: 'IOS' })))
        .status,
    ).toBe(401);
    expect(
      (
        await app.fetch(
          post(
            '/verification/token',
            { platform: 'TV' },
            { authorization: 'Bearer user-1' },
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (await app.fetch(new Request('https://fn.example/webhook/kyc/mock')))
        .status,
    ).toBe(404);
    const health = await app.fetch(new Request('https://fn.example/health'));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });
  });

  it('answers the preflight only when CORS_ALLOWED_ORIGINS names the origin', async () => {
    const preflight = (target: ReturnType<typeof createApp>) =>
      target.fetch(
        new Request('https://fn.example/verification/token', {
          method: 'OPTIONS',
          headers: { origin: 'https://app.example' },
        }),
      );
    expect((await preflight(app)).status).toBe(404);
    const browser = createApp(
      {
        KYC_PROVIDER: 'mock',
        CORS_ALLOWED_ORIGINS: ' https://app.example, https://other.example ,',
      },
      { logger: silent },
    );
    const allowed = await preflight(browser);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://app.example',
    );
  });
});

describe('handlers', () => {
  it('exports the three methods a route handler needs, all onto the app', async () => {
    const app = createApp({ KYC_PROVIDER: 'mock' }, { logger: silent });
    const { GET, POST, OPTIONS } = handlers(app);
    expect((await GET(new Request('https://fn.example/health'))).status).toBe(
      200,
    );
    expect(
      (
        await POST(
          post(
            '/verification/token',
            { platform: 'WEB' },
            { authorization: 'Bearer user-1' },
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await OPTIONS(
          new Request('https://fn.example/verification/token', {
            method: 'OPTIONS',
          }),
        )
      ).status,
    ).toBe(404);
  });
});
