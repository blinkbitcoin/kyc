// The capability set is decided by the environment alone: access tokens are
// always on, sessions follow DATABASE_URL.

import { capabilitiesFromEnv, describeCapabilities, hasSessions } from '../src/capabilities';

describe('hasSessions', () => {
  it('is off without DATABASE_URL', () => {
    expect(hasSessions({})).toBe(false);
  });

  it('is on with a DATABASE_URL', () => {
    expect(hasSessions({ DATABASE_URL: 'postgres://u@h/db' })).toBe(true);
  });

  it('treats a blank DATABASE_URL as unset', () => {
    expect(hasSessions({ DATABASE_URL: '   ' })).toBe(false);
    expect(hasSessions({ DATABASE_URL: '' })).toBe(false);
  });
});

describe('capabilitiesFromEnv', () => {
  it('is tokens-only without DATABASE_URL', () => {
    expect(capabilitiesFromEnv({})).toEqual(['tokens']);
  });

  it('adds sessions with DATABASE_URL', () => {
    expect(capabilitiesFromEnv({ DATABASE_URL: 'postgres://u@h/db' })).toEqual([
      'tokens',
      'sessions',
    ]);
  });

  it('ignores every other variable', () => {
    expect(capabilitiesFromEnv({ KYC_PROVIDER: 'sumsub', PORT: '5000' })).toEqual(['tokens']);
  });
});

describe('describeCapabilities', () => {
  it('lists the capabilities that are on', () => {
    expect(describeCapabilities(['tokens'])).toBe('tokens');
    expect(describeCapabilities(['tokens', 'sessions'])).toBe('tokens, sessions');
  });
});
