// Provider selection from the environment: KYC_PROVIDER names an entry of a
// registry of adapter factories. The factories are lazy, so selecting one
// provider never configures another (the mock needs no SUMSUB_* values).
// Every host in this repo selects its provider this way; a host with its own
// adapter adds an entry.

import type { Logger } from './log';
import type { VerificationProvider } from './provider';
import { createMockProvider } from './providers/mock/provider';
import { type Env, sumsubConfigFromEnv } from './providers/sumsub/config';
import {
  createSumsubProvider,
  type SumsubWebhookOptions,
} from './providers/sumsub/provider';
import type { FetchLike } from './types';

// Provider name → factory (called once, when that provider is selected)
export type ProviderRegistry = Record<string, () => VerificationProvider>;

// The environment variable naming the provider
export const KYC_PROVIDER_ENV = 'KYC_PROVIDER';

export interface ProviderFromEnvOptions {
  // The registry entry used when KYC_PROVIDER is unset or unknown (default 'mock')
  default?: string;
  // Called once for an unknown name before the default is used (default: console.warn)
  onUnknown?: (name: string, fallback: string) => void;
}

const warnUnknown = (name: string, fallback: string): void => {
  console.warn(
    `Unknown ${KYC_PROVIDER_ENV}: ${name}, falling back to ${fallback}`,
  );
};

// The registry entry KYC_PROVIDER selects: the named one, the default when
// the variable is unset, the default plus one warning when it names nothing
// in the registry (a typo must not silently pick another provider, but must
// not take the service down either). Own entries only: 'constructor' and
// friends are not providers.
export const providerNameFromEnv = (
  env: Env,
  registry: ProviderRegistry,
  options: ProviderFromEnvOptions = {},
): string => {
  const fallback = options.default ?? 'mock';
  const name = env[KYC_PROVIDER_ENV] ?? fallback;
  if (Object.hasOwn(registry, name)) {
    return name;
  }
  (options.onUnknown ?? warnUnknown)(name, fallback);
  return fallback;
};

// The provider KYC_PROVIDER names in `registry`, built once
export const providerFromEnv = (
  env: Env,
  registry: ProviderRegistry,
  options: ProviderFromEnvOptions = {},
): VerificationProvider =>
  registry[providerNameFromEnv(env, registry, options)]();

export interface DefaultRegistryOptions {
  // Where the hosted page's webhooks post back (the mock signs them).
  // Default: PUBLIC_BASE_URL, else http://localhost:4000.
  publicBaseUrl?: () => string;
  // The mock's webhook signing secret. Default: MOCK_WEBHOOK_SECRET, else "mock".
  mockWebhookSecret?: () => string;
  // The Sumsub adapter's webhook policy. Default: signatures required.
  sumsubWebhook?: SumsubWebhookOptions;
  fetch?: FetchLike;
  logger?: Logger;
}

// The two adapters this package ships, configured from `env`:
//   sumsub - the real adapter over SUMSUB_* (read when selected)
//   mock   - in-memory, self-signed webhooks, its own hosted page
export const defaultRegistry = (
  env: Env,
  options: DefaultRegistryOptions = {},
): ProviderRegistry => ({
  mock: () =>
    createMockProvider({
      publicBaseUrl:
        options.publicBaseUrl ??
        (() => env.PUBLIC_BASE_URL || 'http://localhost:4000'),
      webhookSecret:
        options.mockWebhookSecret ?? (() => env.MOCK_WEBHOOK_SECRET || 'mock'),
      logger: options.logger,
    }),
  sumsub: () =>
    createSumsubProvider({
      // A getter: the credentials are read on first use, so a selected mock
      // never touches them
      config: () => sumsubConfigFromEnv(env),
      webhook: options.sumsubWebhook,
      fetch: options.fetch,
      logger: options.logger,
    }),
});
