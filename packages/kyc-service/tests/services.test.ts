// The composition root: the package's verification service over this
// service's provider, store, public base URL and tracing. The rules it runs
// are tested in the package; here only the wiring is.

import { vi } from 'vitest';

vi.mock('../src/store', () => ({ store: { composed: 'store' } }));
vi.mock('../src/providers', () => ({
  provider: { composed: 'provider' },
  getProviderName: () => 'mock',
}));
vi.mock('../src/tracing', () => ({
  withSpan: vi.fn(),
  setActiveSpanAttributes: vi.fn(),
}));
vi.mock('@blinkbitcoin/kyc-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@blinkbitcoin/kyc-node')>();
  return { ...actual, createVerificationService: vi.fn(() => ({ composed: 'service' })) };
});

describe('verificationService', () => {
  it('composes the package service over the provider, the store, PUBLIC_BASE_URL and tracing', async () => {
    process.env.PUBLIC_BASE_URL = 'https://kyc.example.com/';
    const { createVerificationService } = await import('@blinkbitcoin/kyc-node');
    const { withSpan, setActiveSpanAttributes } = await import('../src/tracing');
    const { verificationService } = await import('../src/services');

    expect(verificationService).toEqual({ composed: 'service' });
    const deps = vi.mocked(createVerificationService).mock.calls[0][0];
    expect(deps).toMatchObject({
      provider: { composed: 'provider' },
      providerName: 'mock',
      store: { composed: 'store' },
      tracing: { withSpan, annotate: setActiveSpanAttributes },
    });
    expect(deps.publicBaseUrl()).toBe('https://kyc.example.com');
    delete process.env.PUBLIC_BASE_URL;
  });
});
