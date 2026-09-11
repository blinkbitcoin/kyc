// The Sumsub adapter for the service: the package's adapter over the
// service's configuration and webhook policy (ALLOW_INSECURE_DEV allows
// unsigned webhooks; the credentials are read per call so rotation and tests
// see the current environment).

import { createSumsubProvider } from '@blinkbitcoin/kyc-node';
import { isWebhookSignatureRequired } from '../../config';
import { getConfig } from './config';

const handle = createSumsubProvider({
  config: () => getConfig(),
  webhook: { allowMissingSecret: () => !isWebhookSignatureRequired() },
});

export const SumsubProvider = handle;

export { getConfig, validateConfig } from './config';
