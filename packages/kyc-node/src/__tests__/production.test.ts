// The production boot guard: what KYC_ENV=production refuses, and the one
// explicit override. Provider-agnostic - the caller says which provider it
// selected and which demo settings that provider still uses.

import {
  assertProductionConfig,
  KYC_ALLOW_DEMO,
  KYC_ENV,
  ProductionConfigError,
  productionErrors,
} from '../production';

const production = { [KYC_ENV]: 'production' };

describe('productionErrors', () => {
  it.each([
    ['unset KYC_ENV', {}, { provider: 'mock', demo: true }, []],
    [
      'KYC_ENV=development',
      { [KYC_ENV]: 'development' },
      { provider: 'mock', demo: true },
      [],
    ],
    [
      'NODE_ENV=production alone (never the gate)',
      { NODE_ENV: 'production' },
      { provider: 'mock', demo: true },
      [],
    ],
    [
      'production with a real provider on real settings',
      production,
      { provider: 'sumsub', demoSettings: [] },
      [],
    ],
    [
      'production with a demo provider',
      production,
      { provider: 'mock', demo: true },
      ['KYC_ENV=production: the mock provider is a demo provider'],
    ],
    [
      'production with demo settings',
      production,
      { provider: 'sumsub', demoSettings: ['SUMSUB_APP_TOKEN=sbx:…'] },
      ['KYC_ENV=production: SUMSUB_APP_TOKEN=sbx:… is a demo setting'],
    ],
    [
      'KYC_ALLOW_DEMO=true bypasses everything',
      { ...production, [KYC_ALLOW_DEMO]: 'true' },
      { provider: 'mock', demo: true, demoSettings: ['SUMSUB_APP_TOKEN=x'] },
      [],
    ],
    [
      'KYC_ALLOW_DEMO=false is not a bypass',
      { ...production, [KYC_ALLOW_DEMO]: 'false' },
      { provider: 'mock', demo: true },
      ['KYC_ENV=production: the mock provider is a demo provider'],
    ],
  ])('%s', (_case, env, config, expected) => {
    expect(productionErrors(env, config)).toEqual(expected);
  });

  it('names both the variable it gates on and the override', () => {
    expect(KYC_ENV).toBe('KYC_ENV');
    expect(KYC_ALLOW_DEMO).toBe('KYC_ALLOW_DEMO');
  });
});

describe('assertProductionConfig', () => {
  it('passes silently when there is nothing to report', () => {
    expect(() =>
      assertProductionConfig(production, { provider: 'sumsub' }),
    ).not.toThrow();
  });

  it('throws a ProductionConfigError listing every problem and the override', () => {
    try {
      assertProductionConfig(production, {
        provider: 'mock',
        demo: true,
        demoSettings: ['SUMSUB_APP_TOKEN=sbx:…'],
      });
      throw new Error('did not throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionConfigError);
      expect((error as ProductionConfigError).errors).toEqual([
        'KYC_ENV=production: the mock provider is a demo provider',
        'KYC_ENV=production: SUMSUB_APP_TOKEN=sbx:… is a demo setting',
      ]);
      expect((error as Error).name).toBe('ProductionConfigError');
      expect((error as Error).message).toBe(
        'KYC_ENV=production: the mock provider is a demo provider; ' +
          'KYC_ENV=production: SUMSUB_APP_TOKEN=sbx:… is a demo setting. ' +
          'Set KYC_ALLOW_DEMO=true to allow demo settings in production.',
      );
    }
  });
});
