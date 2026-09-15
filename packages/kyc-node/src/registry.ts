// Provider selection from the environment: KYC_PROVIDER names an entry of a
// registry of adapter factories. The factories are lazy, so selecting one
// provider never configures another (the mock needs no SUMSUB_* values).
// Every host in this repo selects its provider this way; a host with its own
// adapter adds an entry.

import type { Logger } from './log';
import { serviceOrigin } from './port';
import { assertProductionConfig } from './production';
import type { VerificationProvider } from './provider';
import { createMockProvider } from './providers/mock/provider';
import {
  ACCESS_TOKEN_SETTINGS,
  assertSumsubConfig,
  type Env,
  type SumsubConfigKey,
  sumsubConfigFromEnv,
  sumsubDemoSettingsInUse,
} from './providers/sumsub/config';
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
  // Default: PUBLIC_BASE_URL, else the service's origin for this worktree
  // (KYC_PORT_BASE + the service's offset - see ./port).
  publicBaseUrl?: () => string;
  // The mock's webhook signing secret. Default: MOCK_WEBHOOK_SECRET, else "mock".
  mockWebhookSecret?: () => string;
  // The Sumsub adapter's webhook policy. Default: signatures required.
  sumsubWebhook?: SumsubWebhookOptions;
  fetch?: FetchLike;
  logger?: Logger;
  sumsub?: {
    // The settings that must be present when the Sumsub entry is selected
    // (default: none - the adapter validates per operation). A host that
    // mints access tokens passes ACCESS_TOKEN_SETTINGS to fail at boot
    // instead of on the first mutation.
    required?: readonly SumsubConfigKey[];
  };
}

// The two adapters this package ships, configured from `env`:
//   sumsub - the real adapter over SUMSUB_* (read when selected)
//   mock   - in-memory, self-signed webhooks, its own hosted page
export const defaultRegistry = (
  env: Env,
  options: DefaultRegistryOptions = {},
): ProviderRegistry => ({
  // Selecting the mock is a boot check: production must not run on it
  mock: () => {
    assertProductionConfig(env, { provider: 'mock', demo: true });
    return createMockProvider({
      publicBaseUrl:
        options.publicBaseUrl ??
        (() => env.PUBLIC_BASE_URL || serviceOrigin(env)),
      webhookSecret:
        options.mockWebhookSecret ?? (() => env.MOCK_WEBHOOK_SECRET || 'mock'),
      logger: options.logger,
    });
  },
  // Selecting Sumsub is a boot check: the settings the host declared
  // required must be present, and production must not be on the sandbox
  // token. The adapter itself keeps reading the environment per call, so
  // credential rotation and tests see the current values.
  sumsub: () => {
    const config = sumsubConfigFromEnv(env);
    assertSumsubConfig(config, options.sumsub?.required ?? []);
    assertProductionConfig(env, {
      provider: 'sumsub',
      demoSettings: sumsubDemoSettingsInUse(config),
    });
    return createSumsubProvider({
      config: () => sumsubConfigFromEnv(env),
      webhook: options.sumsubWebhook,
      fetch: options.fetch,
      logger: options.logger,
    });
  },
});

export interface AccessTokenProviderOptions
  extends DefaultRegistryOptions,
    ProviderFromEnvOptions {
  // The registry to select from (default: defaultRegistry(env, options))
  registry?: ProviderRegistry;
}

// The provider an access-token host mints with: KYC_PROVIDER over the
// default registry, Sumsub unless set, with everything a mint needs
// required at selection time. Throws when the settings are missing
// (SumsubConfigError) or when production is on demo settings
// (ProductionConfigError) - both at boot, never on the first request.
export const accessTokenProviderFromEnv = (
  env: Env,
  options: AccessTokenProviderOptions = {},
): VerificationProvider => {
  const {
    registry,
    default: fallback,
    onUnknown,
    ...registryOptions
  } = options;
  return providerFromEnv(
    env,
    registry ??
      defaultRegistry(env, {
        ...registryOptions,
        sumsub: {
          ...registryOptions.sumsub,
          required: registryOptions.sumsub?.required ?? ACCESS_TOKEN_SETTINGS,
        },
      }),
    { default: fallback ?? 'sumsub', onUnknown },
  );
};
