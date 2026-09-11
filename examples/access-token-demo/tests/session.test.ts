import { vi } from 'vitest';
import { createStartSession } from '../src/session';

describe('createStartSession', () => {
  it('mock provider: mints a mock token for the user and level', async () => {
    const start = createStartSession({ KYC_PROVIDER: 'mock' });
    const session = await start('user-1', 'IOS', 'basic-kyc-level');
    expect(session.accessToken).toMatch(/^mock-token-/);
    expect(session.providerApplicantId).toMatch(/^mock-applicant-/);
  });

  it('sumsub: is the default, refusing to start without the app token and secret', () => {
    expect(() => createStartSession({ KYC_PROVIDER: 'sumsub' })).toThrow(
      /SUMSUB_APP_TOKEN/,
    );
    expect(() => createStartSession({})).toThrow(/SUMSUB_/);
    // The webhook secret is not needed here: this host receives no webhooks
    expect(() =>
      createStartSession({ SUMSUB_APP_TOKEN: 'app', SUMSUB_SECRET_KEY: 'key' }),
    ).not.toThrow();
  });

  it('production refuses the sandbox token and the mock unless demo is allowed', () => {
    const sandbox = {
      KYC_ENV: 'production',
      SUMSUB_APP_TOKEN: 'sbx:app',
      SUMSUB_SECRET_KEY: 'key',
    };
    expect(() => createStartSession(sandbox)).toThrow(
      /SUMSUB_APP_TOKEN=sbx:… is a demo setting/,
    );
    expect(() =>
      createStartSession({ KYC_ENV: 'production', KYC_PROVIDER: 'mock' }),
    ).toThrow(/the mock provider is a demo provider/);
    expect(() =>
      createStartSession({ ...sandbox, KYC_ALLOW_DEMO: 'true' }),
    ).not.toThrow();
  });

  it('sumsub: mints through the Sumsub adapter over the SUMSUB_* environment', async () => {
    const env = {
      SUMSUB_APP_TOKEN: 'app',
      SUMSUB_SECRET_KEY: 'key',
      SUMSUB_LEVEL_NAME: 'lvl',
    };
    // The adapter's HTTP, stubbed: what Sumsub answers a token request with
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ token: 'live', userId: 'user-2' }),
      text: async () => '',
    })) as unknown as typeof globalThis.fetch;
    const start = createStartSession(env, { fetch });
    await expect(
      start('user-2', 'WEB', 'basic-kyc-level'),
    ).resolves.toMatchObject({
      accessToken: 'live',
    });
    await start('user-2', 'ANDROID', 'enhanced-kyc-level');
    expect(fetch).toHaveBeenCalledTimes(2);
    const urls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]) =>
      String(url),
    );
    expect(urls[0]).toContain('levelName=basic-kyc-level');
    expect(urls[1]).toContain('levelName=enhanced-kyc-level');
  });

  it('warns and falls back to the default for an unknown name; takes another registry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => createStartSession({ KYC_PROVIDER: 'onfido' })).toThrow(
      /SUMSUB_/,
    );
    expect(warn).toHaveBeenCalledWith(
      'Unknown KYC_PROVIDER: onfido, falling back to sumsub',
    );
    const createSession = vi.fn().mockResolvedValue({ accessToken: 't' });
    const start = createStartSession(
      { KYC_PROVIDER: 'own' },
      {
        registry: {
          sumsub: () => {
            throw new Error('not this one');
          },
          own: () => ({ createSession }) as never,
        },
      },
    );
    await expect(start('u', 'WEB', 'l')).resolves.toEqual({ accessToken: 't' });
    warn.mockRestore();
  });
});
