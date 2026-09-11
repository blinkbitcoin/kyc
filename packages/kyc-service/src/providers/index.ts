// Provider registry + composition root. The package's providerFromEnv
// selects an adapter from KYC_PROVIDER out of this service's registry: the
// package adapters wired to the service's config and policy, each wrapped in
// tracing. Consumers import the `provider` singleton (or `getProvider` for
// tests); nothing else imports the adapters.

import {
  assertProductionConfig,
  type ProviderRegistry,
  providerFromEnv,
  providerNameFromEnv,
  sumsubDemoSettingsInUse,
} from '@blinkbitcoin/kyc-node';
import { instrumentProvider } from '../tracing';
import { assertMockProviderAllowed, MockProvider } from './mock';
import type { VerificationProvider } from './port';
import { getConfig, SumsubProvider, validateConfig as validateSumsubConfig } from './sumsub';

// Every adapter is wrapped in tracing spans here, so new providers are
// instrumented by construction (see instrumentProvider in tracing.ts). The
// entries are lazy and fail fast at startup, never per request: the mock
// refuses to start outside insecure dev, Sumsub without its credentials,
// and KYC_ENV=production refuses demo settings (the mock, a sandbox token)
// unless KYC_ALLOW_DEMO=true.
export const registry: ProviderRegistry = {
  mock: () => {
    assertMockProviderAllowed();
    assertProductionConfig(process.env, { provider: 'mock', demo: true });
    return instrumentProvider(MockProvider, 'mock');
  },
  sumsub: () => {
    validateSumsubConfig();
    assertProductionConfig(process.env, {
      provider: 'sumsub',
      demoSettings: sumsubDemoSettingsInUse(getConfig()),
    });
    return instrumentProvider(SumsubProvider, 'sumsub');
  },
};

export const isKnownProvider = (name: string): boolean => Object.hasOwn(registry, name);

/** The provider this process is configured for (unknown values read as mock). */
export const getProviderName = (env: NodeJS.ProcessEnv = process.env): string =>
  providerNameFromEnv(env, registry, { onUnknown: () => undefined });

// Provider factory - exported for testing. An unknown name warns and falls
// back to the mock (the package's providerFromEnv default).
export const getProvider = (providerName?: string): VerificationProvider =>
  providerFromEnv(
    providerName === undefined ? process.env : { KYC_PROVIDER: providerName },
    registry
  );

export const provider = getProvider();

export type { VerificationProvider } from './port';
export { supportsHostedPage, supportsUserStatusLookup } from './port';
