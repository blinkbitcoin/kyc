import { vi } from 'vitest';

// createSumsubProvider is replaced per test (the default is the real one),
// so the Sumsub entry can be asserted on without a network
const { createSumsubProvider } = vi.hoisted(() => ({
  createSumsubProvider: vi.fn(),
}));
vi.mock('@blinkbitcoin/kyc-node', async importOriginal => {
  const original =
    await importOriginal<typeof import('@blinkbitcoin/kyc-node')>();
  createSumsubProvider.mockImplementation(original.createSumsubProvider);
  return {
    ...original,
    createSumsubProvider: (...args: unknown[]) => createSumsubProvider(...args),
  };
});

import { createStartSession, registry } from '../src/session';

describe('createStartSession', () => {
  afterEach(() => {
    createSumsubProvider.mockClear();
  });

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

  it('sumsub: mints through the Sumsub adapter over one config object', async () => {
    const env = {
      SUMSUB_APP_TOKEN: 'app',
      SUMSUB_SECRET_KEY: 'key',
      SUMSUB_LEVEL_NAME: 'lvl',
    };
    const createSession = vi.fn().mockResolvedValue({ accessToken: 'live' });
    createSumsubProvider.mockReturnValueOnce({ createSession });
    const start = createStartSession(env);
    await start('user-2', 'WEB', 'basic-kyc-level');
    await start('user-2', 'ANDROID', 'enhanced-kyc-level');
    expect(createSumsubProvider).toHaveBeenCalledTimes(1);
    expect(createSumsubProvider.mock.calls[0][0].config).toMatchObject({
      appToken: 'app',
      levelName: 'lvl',
    });
    expect(createSession).toHaveBeenNthCalledWith(1, 'user-2', {
      platform: 'WEB',
      levelName: 'basic-kyc-level',
    });
    expect(createSession).toHaveBeenNthCalledWith(2, 'user-2', {
      platform: 'ANDROID',
      levelName: 'enhanced-kyc-level',
    });
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
        sumsub: () => {
          throw new Error('not this one');
        },
        own: () => ({ createSession }) as never,
      },
    );
    await expect(start('u', 'WEB', 'l')).resolves.toEqual({ accessToken: 't' });
    warn.mockRestore();
  });

  it('registry: the package entries with this host’s Sumsub entry', () => {
    expect(Object.keys(registry({})).sort()).toEqual(['mock', 'sumsub']);
  });
});
