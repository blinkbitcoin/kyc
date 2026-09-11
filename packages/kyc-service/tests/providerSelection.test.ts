import { vi } from 'vitest';
import { getProvider, getProviderName, isKnownProvider, registry } from '../src/providers';
import { clearApplicants } from '../src/providers/mock';

const SUMSUB_ENV = {
  SUMSUB_APP_TOKEN: 'app-token',
  SUMSUB_SECRET_KEY: 'secret-key',
  SUMSUB_WEBHOOK_SECRET: 'webhook-secret',
};

const originalEnv = { ...process.env };

beforeEach(() => clearApplicants());

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('isKnownProvider / getProviderName', () => {
  it('knows exactly mock and sumsub, never a prototype property', () => {
    expect(Object.keys(registry).sort()).toEqual(['mock', 'sumsub']);
    expect(isKnownProvider('mock')).toBe(true);
    expect(isKnownProvider('sumsub')).toBe(true);
    expect(isKnownProvider('onfido')).toBe(false);
    expect(isKnownProvider('constructor')).toBe(false);
  });

  it('defaults to mock, echoes a configured provider and reads an unknown one as mock, silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getProviderName({} as NodeJS.ProcessEnv)).toBe('mock');
    expect(getProviderName({ KYC_PROVIDER: 'sumsub' } as NodeJS.ProcessEnv)).toBe('sumsub');
    expect(getProviderName({ KYC_PROVIDER: 'nope' } as NodeJS.ProcessEnv)).toBe('mock');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('getProvider', () => {
  it('returns an instrumented mock provider by default, with its hosted page', async () => {
    const provider = getProvider();
    const session = await provider.createSession('user-1', { platform: 'WEB' });
    expect(session.accessToken).toMatch(/^mock-token-/);
    expect(provider.getStatusByUserId).toBeUndefined();
    expect(typeof provider.hostedPage?.render).toBe('function');
  });

  it('returns the instrumented Sumsub provider when configured', () => {
    Object.assign(process.env, SUMSUB_ENV);
    const provider = getProvider('sumsub');
    expect(typeof provider.createSession).toBe('function');
    expect(typeof provider.getStatusByUserId).toBe('function');
    expect(typeof provider.hostedPage?.csp).toBe('function');
  });

  it('fails fast when the Sumsub credentials are missing', () => {
    expect(() => getProvider('sumsub')).toThrow(/Missing required environment variables/);
  });

  it('refuses to hand out the forgeable mock provider outside insecure dev', () => {
    delete process.env.ALLOW_INSECURE_DEV;
    expect(() => getProvider('mock')).toThrow(/KYC_PROVIDER=mock/);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => getProvider('nope')).toThrow(/KYC_PROVIDER=mock/);
  });

  it('warns and falls back to mock for an unknown provider name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = getProvider('nope');
    await expect(provider.createSession('u', { platform: 'WEB' })).resolves.toMatchObject({
      accessToken: expect.stringMatching(/^mock-token-/),
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown KYC_PROVIDER: nope'));
  });

  it('reads KYC_PROVIDER when no name is passed', () => {
    Object.assign(process.env, SUMSUB_ENV, { KYC_PROVIDER: 'sumsub' });
    expect(typeof getProvider().getStatusByUserId).toBe('function');
  });
});

describe('the service adapters', () => {
  it('mock: signs its webhooks with MOCK_WEBHOOK_SECRET and posts to PUBLIC_BASE_URL', async () => {
    const { getMockWebhookSecret, MockProvider, signMockWebhook } = await import(
      '../src/providers/mock'
    );
    expect(getMockWebhookSecret({} as NodeJS.ProcessEnv)).toBe('mock');
    expect(getMockWebhookSecret({ MOCK_WEBHOOK_SECRET: 'other' } as NodeJS.ProcessEnv)).toBe(
      'other'
    );
    const body = '{"applicantId":"a1","status":"approved"}';
    expect(MockProvider.verifyWebhook({ 'x-mock-signature': signMockWebhook(body) }, body)).toBe(
      true
    );
    process.env.PUBLIC_BASE_URL = 'https://kyc.example.com';
    expect(
      MockProvider.hostedPage!.render({ sessionId: 's', userId: 'u', accessToken: 't', nonce: 'n' })
    ).toContain('https://kyc.example.com/webhook/kyc/mock');
  });

  it('sumsub: reads the environment per call and follows the insecure-dev webhook policy', async () => {
    const { getConfig, SumsubProvider, validateConfig } = await import('../src/providers/sumsub');
    expect(getConfig({} as NodeJS.ProcessEnv).levelName).toBe('basic-kyc-level');
    expect(() => validateConfig({} as NodeJS.ProcessEnv)).toThrow(
      /SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_WEBHOOK_SECRET/
    );
    expect(() => validateConfig({ ...SUMSUB_ENV } as NodeJS.ProcessEnv)).not.toThrow();
    // No secret + insecure dev (tests/setup.ts): unsigned webhooks pass with a warning
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(SumsubProvider.verifyWebhook({}, '{}')).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    delete process.env.ALLOW_INSECURE_DEV;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(SumsubProvider.verifyWebhook({}, '{}')).toBe(false);
  });
});
