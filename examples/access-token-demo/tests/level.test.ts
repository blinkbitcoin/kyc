import { DEFAULT_LEVELS, LEVELS, levelFor, levelsFrom } from '../src/level';

describe('levelsFrom', () => {
  it('defaults every tier to the repo level names', () => {
    expect(levelsFrom({})).toEqual(DEFAULT_LEVELS);
    expect(levelsFrom({ KYC_LEVEL_BASIC: '' })).toEqual(DEFAULT_LEVELS);
  });

  it('takes each tier from its own variable, the ones the dashboard configures', () => {
    expect(
      levelsFrom({
        KYC_LEVEL_BASIC: '01-upgrade-to-level-TWO',
        KYC_LEVEL_ENHANCED: '02-blink-debit-card-kyc',
      }),
    ).toEqual({
      basic: '01-upgrade-to-level-TWO',
      enhanced: '02-blink-debit-card-kyc',
    });
  });
});

describe('levelFor', () => {
  it('maps the host tiers onto the configured Sumsub levels', () => {
    expect(Object.keys(LEVELS)).toEqual(['basic', 'enhanced']);
    expect(levelFor('basic', DEFAULT_LEVELS)).toBe('basic-kyc-level');
    expect(levelFor('enhanced', DEFAULT_LEVELS)).toBe('enhanced-kyc-level');
    expect(levelFor('basic')).toBe(LEVELS.basic);
  });

  it('rejects anything else, including prototype properties', () => {
    for (const tier of ['', 'gold', 'constructor', 'toString']) {
      expect(() => levelFor(tier)).toThrow(RangeError);
    }
  });
});
