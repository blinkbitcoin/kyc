import { afterEach, describe, expect, it, vi } from 'vitest';

describe('KYC_MODE', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to hosted', async () => {
    vi.stubEnv('VITE_KYC_MODE', '');
    const { KYC_MODE } = await import('../config');
    expect(KYC_MODE).toBe('hosted');
  });

  it('selects proxy when VITE_KYC_MODE=proxy', async () => {
    vi.stubEnv('VITE_KYC_MODE', 'proxy');
    const { KYC_MODE, GRAPHQL_URL } = await import('../config');
    expect(KYC_MODE).toBe('proxy');
    expect(GRAPHQL_URL).toBe('http://localhost:4000/graphql');
  });
});
