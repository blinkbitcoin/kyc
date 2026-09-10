// What the host decides on its own data: which verification level a user
// goes through. This example keys it on a product tier; a real host looks it
// up (account type, jurisdiction, limits). The level names are the ones
// configured in the Sumsub dashboard (docs/integration/sumsub.md).

export type Tier = 'basic' | 'enhanced';

export const LEVELS: Record<Tier, string> = {
  basic: 'basic-kyc-level',
  enhanced: 'enhanced-kyc-level',
};

// The level for a tier; anything else is a client error, not a lookup
export const levelFor = (tier: string): string => {
  if (!Object.hasOwn(LEVELS, tier)) {
    throw new RangeError(
      `tier must be one of ${Object.keys(LEVELS).join(', ')}`,
    );
  }
  return LEVELS[tier as Tier];
};
