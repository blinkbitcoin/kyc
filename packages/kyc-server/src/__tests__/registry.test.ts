// Provider selection: KYC_PROVIDER → a registry entry, lazily; the default
// registry wires the two shipped adapters from the environment.

import type { VerificationProvider } from '../provider';
import {
  defaultRegistry,
  KYC_PROVIDER_ENV,
  type ProviderRegistry,
  providerFromEnv,
  providerNameFromEnv,
} from '../registry';

const stub = (name: string): VerificationProvider =>
  ({ name }) as unknown as VerificationProvider;

// A registry of two stubs that records which factories ran
const registry = (): { entries: ProviderRegistry; calls: string[] } => {
  const calls: string[] = [];
  const entry = (name: string) => () => {
    calls.push(name);
    return stub(name);
  };
  return { calls, entries: { sumsub: entry('sumsub'), mock: entry('mock') } };
};

describe('providerFromEnv', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('selects the named entry and builds only that one', () => {
    const r = registry();
    expect(providerFromEnv({ KYC_PROVIDER: 'sumsub' }, r.entries)).toEqual({
      name: 'sumsub',
    });
    expect(r.calls).toEqual(['sumsub']);
    expect(warn).not.toHaveBeenCalled();
    expect(KYC_PROVIDER_ENV).toBe('KYC_PROVIDER');
  });

  it('uses the default entry (mock) when the variable is unset, silently', () => {
    const r = registry();
    expect(providerFromEnv({}, r.entries)).toEqual({ name: 'mock' });
    expect(r.calls).toEqual(['mock']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('takes another default', () => {
    expect(
      providerFromEnv({}, registry().entries, { default: 'sumsub' }),
    ).toEqual({
      name: 'sumsub',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the default with one warning for an unknown or empty name', () => {
    const r = registry();
    expect(providerFromEnv({ KYC_PROVIDER: 'onfido' }, r.entries)).toEqual({
      name: 'mock',
    });
    expect(r.calls).toEqual(['mock']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Unknown KYC_PROVIDER: onfido, falling back to mock',
    );
    expect(providerNameFromEnv({ KYC_PROVIDER: '' }, r.entries)).toBe('mock');
  });

  it('never resolves a name through the registry prototype', () => {
    const r = registry();
    expect(
      providerNameFromEnv({ KYC_PROVIDER: 'constructor' }, r.entries),
    ).toBe('mock');
    expect(r.calls).toEqual([]);
  });

  it('reports an unknown name through onUnknown instead of the console', () => {
    const onUnknown = jest.fn();
    expect(
      providerNameFromEnv({ KYC_PROVIDER: 'onfido' }, registry().entries, {
        default: 'sumsub',
        onUnknown,
      }),
    ).toBe('sumsub');
    expect(onUnknown).toHaveBeenCalledWith('onfido', 'sumsub');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('defaultRegistry', () => {
  const silent = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  it('mock: signs webhooks with MOCK_WEBHOOK_SECRET and posts to PUBLIC_BASE_URL, no SUMSUB_* needed', () => {
    const provider = providerFromEnv(
      { KYC_PROVIDER: 'mock' },
      defaultRegistry(
        {
          MOCK_WEBHOOK_SECRET: 's',
          PUBLIC_BASE_URL: 'https://kyc.example.com',
        },
        { logger: silent },
      ),
    );
    const html = provider.hostedPage!.render({
      sessionId: 's1',
      userId: 'u',
      accessToken: 't',
      nonce: 'n',
    });
    expect(html).toContain('https://kyc.example.com/webhook/kyc/mock');
    const body = '{}';
    const other = defaultRegistry({}, { logger: silent }).mock();
    const foreign = (
      other as unknown as { signWebhook(b: string): string }
    ).signWebhook(body);
    expect(provider.verifyWebhook({ 'x-mock-signature': foreign }, body)).toBe(
      false,
    );
  });

  it('ships exactly the two adapters, with every option defaulted', () => {
    // No options at all: the entries exist and nothing is built yet
    expect(Object.keys(defaultRegistry({})).sort()).toEqual(['mock', 'sumsub']);
  });

  it('mock: defaults the base url and secret, or takes the options', () => {
    const defaulted = defaultRegistry({}, { logger: silent }).mock();
    expect(
      defaulted.hostedPage!.render({
        sessionId: 's',
        userId: 'u',
        accessToken: 't',
        nonce: 'n',
      }),
    ).toContain('http://localhost:5100/webhook/kyc/mock');
    const custom = defaultRegistry(
      {},
      { publicBaseUrl: () => 'http://svc:9', mockWebhookSecret: () => 'k' },
    ).mock() as unknown as VerificationProvider & {
      signWebhook(b: string): string;
    };
    expect(
      custom.hostedPage!.render({
        sessionId: 's',
        userId: 'u',
        accessToken: 't',
        nonce: 'n',
      }),
    ).toContain('http://svc:9/webhook/kyc/mock');
    expect(
      custom.verifyWebhook(
        { 'x-mock-signature': custom.signWebhook('{}') },
        '{}',
      ),
    ).toBe(true);
  });

  it('sumsub: reads SUMSUB_* when selected, refuses unsigned webhooks, and takes the webhook policy', async () => {
    const env = {
      SUMSUB_APP_TOKEN: 'app',
      SUMSUB_SECRET_KEY: 'key',
      SUMSUB_WEBHOOK_SECRET: 'wh',
      SUMSUB_LEVEL_NAME: 'lvl',
    };
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ token: 'live', userId: 'u' }),
      text: async () => '',
    })) as unknown as typeof fetch;
    const provider = providerFromEnv(
      { KYC_PROVIDER: 'sumsub' },
      defaultRegistry(env, {
        fetch: fetchImpl,
        logger: silent,
        sumsubWebhook: { logger: silent },
      }),
    );
    expect(provider.verifyWebhook({}, '{}')).toBe(false);
    expect(typeof provider.getStatusByUserId).toBe('function');
    await expect(
      provider.createSession('u', { platform: 'WEB' }),
    ).resolves.toMatchObject({
      accessToken: 'live',
    });
    const [url] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toContain('levelName=lvl');
    const open = defaultRegistry(
      {},
      { sumsubWebhook: { allowMissingSecret: () => true, logger: silent } },
    ).sumsub();
    expect(open.verifyWebhook({}, '{}')).toBe(true);
  });
});
