// Sumsub configuration for the service: the package's SUMSUB_* env mapping
// (read on every call so tests and credential rotation see the current
// environment) plus the service's boot-time check.

import {
  ACCESS_TOKEN_SETTINGS,
  assertSumsubConfig,
  type SumsubConfig,
  sumsubConfigFromEnv,
} from '@blinkbitcoin/kyc-node';
import type { Env } from '../../env';

export const getConfig = (env: Env = process.env): SumsubConfig => sumsubConfigFromEnv(env);

// What every deployment on Sumsub needs: the app token and the secret that
// mint an access token. The webhook secret is the sessions capability's
// concern (config.ts asks for it exactly when the webhook route exists).
// Throws so a misconfigured deployment fails at startup with a clear
// message, instead of booting fine and crashing on the first session.
export const assertSumsubSettings = (env: Env = process.env): void => {
  assertSumsubConfig(getConfig(env), ACCESS_TOKEN_SETTINGS);
};
