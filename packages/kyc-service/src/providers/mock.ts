// The mock adapter for the service: the package's in-memory provider, its
// webhooks signed with MOCK_WEBHOOK_SECRET and posted back to this service,
// its hosted page served through the sessions route like any provider's.
//
// A factory, not an instance. The handle it returns carries the mock's own
// state (the applicants it created), so a test that drives the mock must
// hold the very handle the app runs on - `selectProvider` hands both to
// the app together.
//
// The mock provider signs its own webhooks with a key that defaults to
// "mock", so anyone who can reach the webhook route can forge an `approved`
// event. That is fine for dev and E2E and unacceptable anywhere else, so
// selecting it is an explicit insecure-dev opt-in, checked at boot.

import { createMockProvider, type MockProviderHandle } from '@blinkbitcoin/kyc-node';
import { type Env, isInsecureDevAllowed } from '../env';
import { getPublicBaseUrl } from '../publicUrl';

export const assertMockProviderAllowed = (env: Env = process.env): void => {
  if (!isInsecureDevAllowed(env)) {
    throw new Error(
      'Refusing to start: KYC_PROVIDER=mock signs its own webhooks and is forgeable. ' +
        'Set ALLOW_INSECURE_DEV=true for local dev, or configure a real provider.'
    );
  }
};

export const getMockWebhookSecret = (env: Env = process.env): string =>
  env.MOCK_WEBHOOK_SECRET || 'mock';

// The mock, posting its webhooks to this deployment's PUBLIC_BASE_URL and
// signing them with this deployment's secret - both read per call, so a
// test that changes the environment sees the change
export const createMock = (env: Env = process.env): MockProviderHandle =>
  createMockProvider({
    publicBaseUrl: () => getPublicBaseUrl(env),
    webhookSecret: () => getMockWebhookSecret(env),
  });

// The X-Mock-Signature for a raw body under `env`'s secret (the E2E suites
// drive the webhook route). Signing is a pure HMAC over the body, so a fresh
// handle signs exactly what the app's handle verifies.
export const signMockWebhook = (body: string, env: Env = process.env): string =>
  createMock(env).signWebhook(body);
