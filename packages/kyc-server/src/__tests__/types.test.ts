import {
  isVerificationPlatform,
  isVerificationStatus,
  TERMINAL_STATUSES,
  VERIFICATION_PLATFORMS,
  VERIFICATION_STATUSES,
} from '../types';

// The SDL parity of these lists is graphql.test.ts's job.

describe('VERIFICATION_STATUSES', () => {
  it('guards known and unknown values', () => {
    expect(VERIFICATION_STATUSES).toHaveLength(6);
    expect(isVerificationStatus('approved')).toBe(true);
    expect(isVerificationStatus('finallyRejected')).toBe(true);
    expect(isVerificationStatus('APPROVED')).toBe(false);
    expect(isVerificationStatus(undefined)).toBe(false);
    expect(isVerificationStatus(7)).toBe(false);
  });
});

describe('VERIFICATION_PLATFORMS', () => {
  it('guards known and unknown values', () => {
    expect(VERIFICATION_PLATFORMS).toEqual(['WEB', 'IOS', 'ANDROID']);
    expect(isVerificationPlatform('WEB')).toBe(true);
    expect(isVerificationPlatform('web')).toBe(false);
    expect(isVerificationPlatform(null)).toBe(false);
  });
});

describe('TERMINAL_STATUSES', () => {
  it('holds exactly the two statuses a webhook may never downgrade', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual([
      'approved',
      'finallyRejected',
    ]);
  });
});
