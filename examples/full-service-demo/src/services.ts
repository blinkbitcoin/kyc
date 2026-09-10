// Composition root for the domain: the verification service over the
// configured provider and the Postgres store, with OpenTelemetry spans.

import { createVerificationService } from '@blinkbitcoin/kyc-server';
import { getPublicBaseUrl } from './config';
import { getProviderName, provider } from './providers';
import { store } from './store';
import { setActiveSpanAttributes, withSpan } from './tracing';

export const verificationService = createVerificationService({
  provider,
  providerName: getProviderName(),
  store,
  publicBaseUrl: () => getPublicBaseUrl(),
  tracing: { withSpan, annotate: setActiveSpanAttributes },
});
