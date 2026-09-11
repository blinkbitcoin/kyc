// The one call to @blinkbitcoin/kyc-node this host makes: createSession on
// the provider KYC_PROVIDER selects, which for Sumsub is minting an access
// token for the user's external id. With KYC_PROVIDER=mock the mock provider
// mints a mock-token-… string, so the mutation runs with no Sumsub account.

import {
  type AccessTokenProviderOptions,
  accessTokenProviderFromEnv,
  type ProviderSession,
  type VerificationPlatform,
} from '@blinkbitcoin/kyc-node';

export type StartSession = (
  userId: string,
  platform: VerificationPlatform,
  levelName: string,
) => Promise<ProviderSession>;

// The session minter for the selected provider (KYC_PROVIDER, Sumsub unless
// set), through the package's access-token preset: the app token and secret
// are required when the provider is selected (fail at startup, not on the
// first mutation), and KYC_ENV=production refuses the sandbox token and the
// mock. This host never receives webhooks, so no webhook secret and no
// webhook policy. The options reach the preset: a registry of the host's
// own adapters, a fetch, a logger.
export const createStartSession = (
  env: NodeJS.ProcessEnv = process.env,
  options: AccessTokenProviderOptions = {},
): StartSession => {
  const provider = accessTokenProviderFromEnv(env, options);
  return (userId, platform, levelName) =>
    provider.createSession(userId, { platform, levelName });
};
