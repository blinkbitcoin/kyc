// Sumsub configuration for the service: the package's SUMSUB_* env mapping
// (read on every call so tests and credential rotation see the current
// environment) plus the service's boot-time validation.

import {
  missingSumsubConfig,
  type SumsubConfig,
  sumsubConfigFromEnv,
} from '@blinkbitcoin/kyc-server';

export const getConfig = (env: NodeJS.ProcessEnv = process.env): SumsubConfig =>
  sumsubConfigFromEnv(env);

// Throws so a misconfigured server fails at startup with a clear message,
// instead of booting fine and crashing on the first session.
export const validateConfig = (env: NodeJS.ProcessEnv = process.env): void => {
  const missing = missingSumsubConfig(getConfig(env));
  if (missing.length > 0) {
    throw new Error(
      `Sumsub provider: Missing required environment variables: ${missing.join(', ')}`
    );
  }
};
