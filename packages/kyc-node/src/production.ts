// The production boot guard: a deployment that says it is production must
// not be running on demo settings - a mock provider, or a provider still on
// its sandbox credentials. The check is provider-agnostic: the caller says
// which provider it selected and which demo settings that provider still
// uses (the Sumsub adapter's sumsubDemoSettingsInUse, say), so this module
// imports no provider (the provider-boundary test enforces it).
//
// It gates on KYC_ENV alone, never NODE_ENV: NODE_ENV=production is set by
// every Node image and by CI smokes that run the mock on purpose, so it says
// nothing about the verification configuration. One explicit override,
// KYC_ALLOW_DEMO=true, keeps a production-shaped staging deployment on the
// sandbox possible.

// The variable that declares a deployment production
export const KYC_ENV = 'KYC_ENV';

// The one bypass: demo settings are allowed in production when it is 'true'
export const KYC_ALLOW_DEMO = 'KYC_ALLOW_DEMO';

// The value of KYC_ENV the guard reacts to
const PRODUCTION = 'production';

export interface ProductionConfig {
  // The selected provider's registry name (reported in the error)
  provider: string;
  // The provider itself is a demo/mock provider
  demo?: boolean;
  // Demo settings the provider is still configured with, as "VAR=value"
  // (a secret reduced to what identifies it as demo, never the value)
  demoSettings?: string[];
}

// Everything wrong with running `config` as production, one message per
// problem. Empty unless KYC_ENV=production, and always empty with
// KYC_ALLOW_DEMO=true.
export const productionErrors = (
  env: Record<string, string | undefined>,
  config: ProductionConfig,
): string[] => {
  if (env[KYC_ENV] !== PRODUCTION || env[KYC_ALLOW_DEMO] === 'true') {
    return [];
  }
  const prefix = `${KYC_ENV}=${PRODUCTION}:`;
  return [
    ...(config.demo
      ? [`${prefix} the ${config.provider} provider is a demo provider`]
      : []),
    ...(config.demoSettings ?? []).map(
      setting => `${prefix} ${setting} is a demo setting`,
    ),
  ];
};

// A production deployment configured with demo settings
export class ProductionConfigError extends Error {
  constructor(public readonly errors: string[]) {
    super(
      `${errors.join('; ')}. Set ${KYC_ALLOW_DEMO}=true to allow demo settings in production.`,
    );
    this.name = 'ProductionConfigError';
  }
}

// Throw a ProductionConfigError when production is configured with demo
// settings - at selection/boot time, not on the first request
export const assertProductionConfig = (
  env: Record<string, string | undefined>,
  config: ProductionConfig,
): void => {
  const errors = productionErrors(env, config);
  if (errors.length > 0) {
    throw new ProductionConfigError(errors);
  }
};
