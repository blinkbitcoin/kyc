import { LEVELS, levelFor } from '../src/level';

describe('levelFor', () => {
  it('maps the host tiers onto the configured Sumsub levels', () => {
    expect(levelFor('basic')).toBe('basic-kyc-level');
    expect(levelFor('enhanced')).toBe('enhanced-kyc-level');
    expect(Object.keys(LEVELS)).toEqual(['basic', 'enhanced']);
  });

  it('rejects anything else, including prototype properties', () => {
    for (const tier of ['', 'gold', 'constructor', 'toString']) {
      expect(() => levelFor(tier)).toThrow(RangeError);
    }
  });
});
