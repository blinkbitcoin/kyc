import {
  isLaunchable,
  isTokenRefreshable,
  isVerificationStatus,
  VERIFICATION_STATUSES,
} from '../index';
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

describe('isVerificationStatus', () => {
  it('accepts every status in the vocabulary', () => {
    expect(VERIFICATION_STATUSES).toEqual([
      'initial',
      'incomplete',
      'pending',
      'approved',
      'declined',
      'finallyRejected',
    ]);
    for (const status of VERIFICATION_STATUSES) {
      expect(isVerificationStatus(status)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isVerificationStatus('APPROVED')).toBe(false);
    expect(isVerificationStatus('')).toBe(false);
    expect(isVerificationStatus(undefined)).toBe(false);
    expect(isVerificationStatus({ status: 'approved' })).toBe(false);
  });
});
