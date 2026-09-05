import type { VerificationProvider } from '../src/providers/port';
import { supportsUserStatusLookup } from '../src/providers/port';

const base: VerificationProvider = {
  createSession: async () => ({ accessToken: 't' }),
  refreshToken: async () => ({ accessToken: 't' }),
  getStatus: async () => 'pending',
  verifyWebhook: () => true,
  parseWebhookEvent: () => null,
};

describe('supportsUserStatusLookup', () => {
  it('is false for a provider without the optional capability', () => {
    expect(supportsUserStatusLookup(base)).toBe(false);
  });

  it('is true once the capability is implemented', () => {
    const capable: VerificationProvider = {
      ...base,
      getStatusByUserId: async () => 'approved',
    };
    expect(supportsUserStatusLookup(capable)).toBe(true);
    // Narrowed: calling it needs no non-null assertion.
    if (supportsUserStatusLookup(capable)) {
      expect(capable.getStatusByUserId('u1')).resolves.toBe('approved');
    }
  });
});
