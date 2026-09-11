// The one call to @blinkbitcoin/kyc-node this host makes: createSession on
// the provider KYC_PROVIDER selects, which for Sumsub is minting an access
// token for the user's external id. With KYC_PROVIDER=mock the mock provider
// mints a mock-token-… string, so the mutation runs with no Sumsub account.

import {
  assertSumsubConfig,
  createSumsubProvider,
  defaultRegistry,
  type ProviderRegistry,
  type ProviderSession,
  providerFromEnv,
  sumsubConfigFromEnv,
  type VerificationPlatform,
} from '@blinkbitcoin/kyc-node';

export type StartSession = (
  userId: string,
  platform: VerificationPlatform,
  levelName: string,
) => Promise<ProviderSession>;

// The package's registry, with this host's Sumsub entry: the credentials are
// checked when the provider is selected (fail at startup, not on the first
// mutation). This host never receives webhooks, so no webhook policy.
export const registry = (env: NodeJS.ProcessEnv): ProviderRegistry => ({
  ...defaultRegistry(env),
  sumsub: () => {
    const config = sumsubConfigFromEnv(env);
    assertSumsubConfig(config, ['appToken', 'secretKey']);
    return createSumsubProvider({ config });
  },
});

// The session minter for the selected provider (KYC_PROVIDER, Sumsub unless set)
export const createStartSession = (
  env: NodeJS.ProcessEnv = process.env,
  providers: ProviderRegistry = registry(env),
): StartSession => {
  const provider = providerFromEnv(env, providers, { default: 'sumsub' });
  return (userId, platform, levelName) =>
    provider.createSession(userId, { platform, levelName });
};
