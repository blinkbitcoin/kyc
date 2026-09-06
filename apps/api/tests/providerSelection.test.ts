import { vi } from 'vitest';
import { getProvider, getProviderName, isKnownProvider } from '../src/providers';
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
  it('knows exactly mock and sumsub', () => {
    expect(isKnownProvider('mock')).toBe(true);
    expect(isKnownProvider('sumsub')).toBe(true);
    expect(isKnownProvider('docusign')).toBe(false);
  });

  it('defaults to mock and echoes a configured provider', () => {
    expect(getProviderName({} as NodeJS.ProcessEnv)).toBe('mock');
    expect(getProviderName({ KYC_PROVIDER: 'sumsub' } as NodeJS.ProcessEnv)).toBe('sumsub');
  });

  it('reports an unknown configured provider as mock', () => {
    expect(getProviderName({ KYC_PROVIDER: 'nope' } as NodeJS.ProcessEnv)).toBe('mock');
  });
});

describe('getProvider', () => {
  it('returns an instrumented mock provider by default', async () => {
    const provider = getProvider();
    const session = await provider.createSession('user-1', { platform: 'WEB' });
    expect(session.accessToken).toMatch(/^mock-token-/);
    expect(provider.getStatusByUserId).toBeUndefined();
  });

  it('returns the instrumented Sumsub provider when configured', () => {
    Object.assign(process.env, SUMSUB_ENV);
    const provider = getProvider('sumsub');
    expect(typeof provider.createSession).toBe('function');
    expect(typeof provider.getStatusByUserId).toBe('function');
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
