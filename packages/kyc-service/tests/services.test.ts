// The composition root: the package's verification service over the
// provider the app resolved, the store the session capability built, the
// public base URL and tracing. The rules it runs are tested in the package;
// here only the wiring is.

import { vi } from 'vitest';

vi.mock('../src/tracing', () => ({
  withSpan: vi.fn(),
  setActiveSpanAttributes: vi.fn(),
}));
vi.mock('@blinkbitcoin/kyc-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@blinkbitcoin/kyc-node')>();
  return { ...actual, createVerificationService: vi.fn(() => ({ composed: 'service' })) };
});

describe('createServices', () => {
  it('composes the package service over the injected provider, store, base URL and tracing', async () => {
    const { createVerificationService } = await import('@blinkbitcoin/kyc-node');
    const { withSpan, setActiveSpanAttributes } = await import('../src/tracing');
    const { createServices } = await import('../src/services');

    const provider = { composed: 'provider' } as never;
    const store = { composed: 'store' } as never;
    const publicBaseUrl = () => 'https://kyc.example.com';
    expect(createServices({ provider, providerName: 'mock', store, publicBaseUrl })).toEqual({
      composed: 'service',
    });
    expect(vi.mocked(createVerificationService).mock.calls[0][0]).toEqual({
      provider,
      providerName: 'mock',
      store,
      publicBaseUrl,
      tracing: { withSpan, annotate: setActiveSpanAttributes },
    });
  });
});
