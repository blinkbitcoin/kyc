// Provider selection: KYC_PROVIDER → this service's registry entry, from the
// env it is handed and nothing else. The boot checks each entry makes are
// the reason selection is what the boot guard runs.

import { vi } from 'vitest';

import { getProvider, selectProvider } from '../src/providers';
import { createMock, getMockWebhookSecret, signMockWebhook } from '../src/providers/mock';
import { assertSumsubSettings, createSumsub, getConfig } from '../src/providers/sumsub';

const DEV = { ALLOW_INSECURE_DEV: 'true' };
const SUMSUB = { SUMSUB_APP_TOKEN: 'app-token', SUMSUB_SECRET_KEY: 'secret-key' };

describe('selectProvider', () => {
  it('selects the instrumented mock by default, with its handle and its hosted page', async () => {
    const selected = selectProvider({ ...DEV });

    expect(selected.providerName).toBe('mock');
    expect(selected.mock).toBeDefined();
    const session = await selected.provider.createSession('user-1', { platform: 'WEB' });
    expect(session.accessToken).toMatch(/^mock-token-/);
    expect(selected.provider.getStatusByUserId).toBeUndefined();
    expect(typeof selected.provider.hostedPage?.render).toBe('function');
  });

  it('selects the instrumented Sumsub adapter when configured, with no mock handle', () => {
    const selected = selectProvider({ KYC_PROVIDER: 'sumsub', ...SUMSUB });

    expect(selected.providerName).toBe('sumsub');
    expect(selected.mock).toBeUndefined();
    expect(typeof selected.provider.createSession).toBe('function');
    expect(typeof selected.provider.getStatusByUserId).toBe('function');
    expect(typeof selected.provider.hostedPage?.csp).toBe('function');
  });

  it('fails fast when the settings a mint needs are missing', () => {
    expect(() => selectProvider({ KYC_PROVIDER: 'sumsub' })).toThrow(
      /missing required environment variables: SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY/
    );
  });

  it('refuses to hand out the forgeable mock provider outside insecure dev', () => {
    expect(() => selectProvider({})).toThrow(/KYC_PROVIDER=mock/);
  });

  it('KYC_ENV=production refuses the mock and a sandbox token unless demo is allowed', () => {
    expect(() => selectProvider({ ...DEV, KYC_ENV: 'production' })).toThrow(
      /the mock provider is a demo provider/
    );
    const sandbox = { KYC_PROVIDER: 'sumsub', ...SUMSUB, SUMSUB_APP_TOKEN: 'sbx:app-token' };
    expect(() => selectProvider({ ...sandbox, KYC_ENV: 'production' })).toThrow(
      /SUMSUB_APP_TOKEN=sbx:… is a demo setting/
    );
    expect(() =>
      selectProvider({ ...sandbox, KYC_ENV: 'production', KYC_ALLOW_DEMO: 'true' })
    ).not.toThrow();
    expect(() =>
      selectProvider({ ...DEV, KYC_ENV: 'production', KYC_ALLOW_DEMO: 'true' })
    ).not.toThrow();
    expect(() =>
      selectProvider({ KYC_PROVIDER: 'sumsub', ...SUMSUB, KYC_ENV: 'production' })
    ).not.toThrow();
  });

  it('warns and falls back to the mock for an unknown name, or reports it through onUnknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const selected = selectProvider({ ...DEV, KYC_PROVIDER: 'onfido' });
    expect(selected.providerName).toBe('mock');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown KYC_PROVIDER: onfido'));
    warn.mockRestore();

    const onUnknown = vi.fn();
    expect(selectProvider({ ...DEV, KYC_PROVIDER: 'onfido' }, { onUnknown }).providerName).toBe(
      'mock'
    );
    expect(onUnknown).toHaveBeenCalledWith('onfido', 'mock');
  });

  it('reads process.env by default (tests/setup.ts puts the suite in insecure dev)', () => {
    expect(selectProvider().providerName).toBe('mock');
    expect(typeof getProvider().createSession).toBe('function');
  });
});

describe('the service adapters', () => {
  it('mock: signs its webhooks with MOCK_WEBHOOK_SECRET and posts to PUBLIC_BASE_URL', () => {
    expect(getMockWebhookSecret({})).toBe('mock');
    expect(getMockWebhookSecret({ MOCK_WEBHOOK_SECRET: 'other' })).toBe('other');
    const env = { ...DEV, PUBLIC_BASE_URL: 'https://kyc.example.com', MOCK_WEBHOOK_SECRET: 'k' };
    const handle = createMock(env);
    const body = '{"applicantId":"a1","status":"approved"}';
    // A fresh handle under the same env signs what the app's handle verifies
    expect(handle.verifyWebhook({ 'x-mock-signature': signMockWebhook(body, env) }, body)).toBe(
      true
    );
    // A bad signature is a security event on the console
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      handle.verifyWebhook(
        { 'x-mock-signature': signMockWebhook(body, { ...env, MOCK_WEBHOOK_SECRET: 'z' }) },
        body
      )
    ).toBe(false);
    expect(error).toHaveBeenCalledWith('Security event:', expect.stringContaining('Mock webhook'));
    error.mockRestore();
    expect(
      handle.hostedPage.render({ sessionId: 's', userId: 'u', accessToken: 't', nonce: 'n' })
    ).toContain('https://kyc.example.com/webhook/kyc/mock');
    // process.env by default: the suite's insecure dev gives the local origin
    expect(
      createMock().hostedPage.render({ sessionId: 's', userId: 'u', accessToken: 't', nonce: 'n' })
    ).toContain('http://localhost:5100/webhook/kyc/mock');
    expect(typeof signMockWebhook(body)).toBe('string');
  });

  it('sumsub: reads the environment it was handed per call and follows the insecure-dev webhook policy', () => {
    expect(getConfig({}).levelName).toBe('basic-kyc-level');
    expect(getConfig().levelName).toBe('basic-kyc-level');
    expect(() => assertSumsubSettings({})).toThrow(/SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY/);
    expect(() => assertSumsubSettings()).toThrow(/SUMSUB_APP_TOKEN/);
    expect(() => assertSumsubSettings({ ...SUMSUB })).not.toThrow();
    // No secret + insecure dev: unsigned webhooks pass with a warning
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createSumsub({ ...DEV, ...SUMSUB }).verifyWebhook({}, '{}')).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(createSumsub({ ...SUMSUB }).verifyWebhook({}, '{}')).toBe(false);
    // process.env by default: the suite's insecure dev
    expect(createSumsub().verifyWebhook({}, '{}')).toBe(true);
    error.mockRestore();
    warn.mockRestore();
  });
});
