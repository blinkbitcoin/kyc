// Composition root for the domain: the verification service over the
// provider the app selected and the Postgres store, with OpenTelemetry spans.
//
// A factory: the provider is whatever `createKycApp` resolved, so the
// GraphQL resolvers, the hosted page and the webhook always run on the same
// adapter - an injected `deps.provider` cannot be silently ignored by one
// of them.

import {
  createVerificationService,
  type SessionStore,
  type VerificationService,
} from '@blinkbitcoin/kyc-node';
import type { VerificationProvider } from './providers/port';
import { setActiveSpanAttributes, withSpan } from './tracing';

export interface ServicesOptions {
  // The adapter the app resolved, and the name it is registered under (the
  // webhook route accepts that provider's deliveries only)
  provider: VerificationProvider;
  providerName: string;
  // The store the session capability built from its env - never a
  // module-level singleton
  store: SessionStore;
  // Where the hosted page is reachable (the URL handed to clients, and the
  // origin they pin postMessage to)
  publicBaseUrl: () => string;
}

export const createServices = (options: ServicesOptions): VerificationService =>
  createVerificationService({
    provider: options.provider,
    providerName: options.providerName,
    store: options.store,
    publicBaseUrl: options.publicBaseUrl,
    tracing: { withSpan, annotate: setActiveSpanAttributes },
  });
