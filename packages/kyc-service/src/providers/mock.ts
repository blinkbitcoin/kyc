// The mock adapter for the service: the package's in-memory provider, its
// webhooks signed with MOCK_WEBHOOK_SECRET and posted back to this service.
//
// The mock provider signs its own webhooks with a key that defaults to
// "mock", so anyone who can reach the webhook route can forge an `approved`
// event. That is fine for dev and E2E and unacceptable anywhere else, so
// selecting it is an explicit insecure-dev opt-in, checked at boot.

import { createMockProvider } from '@blinkbitcoin/kyc-node';
import { getPublicBaseUrl, isInsecureDevAllowed } from '../config';

export const assertMockProviderAllowed = (env: NodeJS.ProcessEnv = process.env): void => {
  if (!isInsecureDevAllowed(env)) {
    throw new Error(
      'Refusing to start: KYC_PROVIDER=mock signs its own webhooks and is forgeable. ' +
        'Set ALLOW_INSECURE_DEV=true for local dev, or configure a real provider.'
    );
  }
};

export const getMockWebhookSecret = (env: NodeJS.ProcessEnv = process.env): string =>
  env.MOCK_WEBHOOK_SECRET || 'mock';

const handle = createMockProvider({
  publicBaseUrl: () => getPublicBaseUrl(),
  webhookSecret: () => getMockWebhookSecret(),
});

export const MockProvider = handle;

// The X-Mock-Signature for a raw body (E2E suites drive the webhook route)
export const signMockWebhook = (body: string): string => handle.signWebhook(body);

// Test helpers
export const setApplicantStatus = handle.setApplicantStatus;
export const addApplicant = handle.addApplicant;
export const clearApplicants = handle.clearApplicants;
