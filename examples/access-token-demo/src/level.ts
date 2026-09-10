// What the host decides on its own data: which verification level a user
// goes through. This example keys it on a product tier; a real host looks it
// up (account type, jurisdiction, limits). The level names are the ones
// configured in the Sumsub dashboard (docs/integration/sumsub.md), and they
// differ per Sumsub account, so each tier's level is an environment
// variable with the sandbox default behind it: KYC_LEVEL_BASIC,
// KYC_LEVEL_ENHANCED (the first live run against Blink's sandbox hit this -
// its levels are named after Blink's account tiers, not the repo default).

export type Tier = 'basic' | 'enhanced';

export const DEFAULT_LEVELS: Record<Tier, string> = {
  basic: 'basic-kyc-level',
  enhanced: 'enhanced-kyc-level',
};

export const LEVEL_ENV: Record<Tier, string> = {
  basic: 'KYC_LEVEL_BASIC',
  enhanced: 'KYC_LEVEL_ENHANCED',
};

/** The tier table for an environment: each tier's variable, else its default. */
export const levelsFrom = (
  env: Record<string, string | undefined>,
): Record<Tier, string> => ({
  basic: env[LEVEL_ENV.basic] || DEFAULT_LEVELS.basic,
  enhanced: env[LEVEL_ENV.enhanced] || DEFAULT_LEVELS.enhanced,
});

export const LEVELS: Record<Tier, string> = levelsFrom(process.env);

// The level for a tier; anything else is a client error, not a lookup
export const levelFor = (
  tier: string,
  levels: Record<Tier, string> = LEVELS,
): string => {
  if (!Object.hasOwn(levels, tier)) {
    throw new RangeError(
      `tier must be one of ${Object.keys(levels).join(', ')}`,
    );
  }
  return levels[tier as Tier];
};
