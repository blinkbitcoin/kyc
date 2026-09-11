// The Sumsub adapter for the service: the package's adapter over the
// service's configuration and webhook policy (ALLOW_INSECURE_DEV allows
// unsigned webhooks; the credentials are read per call so rotation and tests
// see the current environment).
//
// A factory: the adapter closes over the env the app was handed, never
// over process.env at import time.

import { createSumsubProvider, type SumsubProviderHandle } from '@blinkbitcoin/kyc-node';
import { type Env, isWebhookSignatureRequired } from '../../env';
import { getConfig } from './config';

export const createSumsub = (env: Env = process.env): SumsubProviderHandle =>
  createSumsubProvider({
    config: () => getConfig(env),
    webhook: { allowMissingSecret: () => !isWebhookSignatureRequired(env) },
  });

export { assertSumsubSettings, getConfig } from './config';
