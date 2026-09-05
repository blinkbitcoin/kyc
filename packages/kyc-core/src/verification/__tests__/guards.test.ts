import { isLaunchable, isTokenRefreshable } from '../index';
import type { VerificationSession, VerificationSource } from '../types';

const session: VerificationSession = { provider: 'mock' };

const plain: VerificationSource = {
  start: async () => session,
  interpret: () => null,
};

describe('isLaunchable', () => {
  it('is false for a plain source', () => {
    expect(isLaunchable(plain)).toBe(false);
  });

  it('is true when launch() is a function', () => {
    const launchable = {
      ...plain,
      launch: async () => ({ status: 'approved' as const }),
    };
    expect(isLaunchable(launchable)).toBe(true);
  });
});

describe('isTokenRefreshable', () => {
  it('is false for a plain source', () => {
    expect(isTokenRefreshable(plain)).toBe(false);
  });

  it('is true when refreshToken() is a function', () => {
    const refreshable = { ...plain, refreshToken: async () => 'token' };
    expect(isTokenRefreshable(refreshable)).toBe(true);
  });
});
