import type { VerificationProvider } from '../provider';
import { supportsHostedPage, supportsUserStatusLookup } from '../provider';

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

  it('is true once the capability is implemented', async () => {
    const capable: VerificationProvider = {
      ...base,
      getStatusByUserId: async () => ({ status: 'approved' as const }),
    };
    expect(supportsUserStatusLookup(capable)).toBe(true);
    // Narrowed: calling it needs no non-null assertion.
    if (supportsUserStatusLookup(capable)) {
      await expect(capable.getStatusByUserId('u1')).resolves.toEqual({
        status: 'approved',
      });
    }
  });
});

describe('supportsHostedPage', () => {
  it('is false for a provider without a page', () => {
    expect(supportsHostedPage(base)).toBe(false);
    expect(supportsHostedPage({ ...base, hostedPage: {} as never })).toBe(
      false,
    );
  });

  it('is true once the provider renders a page', () => {
    const capable: VerificationProvider = {
      ...base,
      hostedPage: { render: () => '<html>' },
    };
    expect(supportsHostedPage(capable)).toBe(true);
    if (supportsHostedPage(capable)) {
      expect(
        capable.hostedPage.render({
          sessionId: 's',
          userId: 'u',
          accessToken: 't',
          nonce: 'n',
        }),
      ).toBe('<html>');
    }
  });
});
