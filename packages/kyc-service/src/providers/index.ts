// Provider selection + composition root. `KYC_PROVIDER` names an entry of
// this service's registry: the package adapters wired to the service's
// config and policy, each wrapped in tracing.
//
// Selection is a function of the environment it is handed, and it builds
// fresh adapters every time. Nothing is constructed at module load, so a
// Worker's bindings - never `process.env` - decide what a Worker mints with,
// and an app built with an injected provider has no singleton to disagree
// with.

import {
  assertProductionConfig,
  type MockProviderHandle,
  type ProviderRegistry,
  providerNameFromEnv,
  sumsubDemoSettingsInUse,
} from '@blinkbitcoin/kyc-node';
import type { Env } from '../env';
import { instrumentProvider } from '../tracing';
import { assertMockProviderAllowed, createMock } from './mock';
import type { VerificationProvider } from './port';
import { assertSumsubSettings, createSumsub, getConfig } from './sumsub';

export interface ProviderSelection {
  // The adapter to mint, verify webhooks and render the hosted page with,
  // wrapped in tracing spans
  provider: VerificationProvider;
  // The name it is registered under: only that provider may deliver
  // webhooks, so a mock payload can never drive a Sumsub deployment
  providerName: string;
  // Present when the mock was selected: the very handle the app runs on, so
  // a test can seed and read the applicants this app's mint stored
  mock?: MockProviderHandle;
}

export interface SelectProviderOptions {
  // Called once for an unknown name before the default is used (default:
  // the package's console warning)
  onUnknown?: (name: string, fallback: string) => void;
}

// The adapter `KYC_PROVIDER` names in `env`, plus whatever else that choice
// makes available. Every adapter is wrapped in tracing here, so new
// providers are instrumented by construction (see instrumentProvider in
// tracing.ts). The entries are lazy and fail fast at selection, never per
// request: the mock refuses to start outside insecure dev, Sumsub without
// the settings a mint needs, and KYC_ENV=production refuses demo settings
// (the mock, a sandbox token) unless KYC_ALLOW_DEMO=true. An unknown name
// warns and falls back to the mock.
export const selectProvider = (
  env: Env = process.env,
  options: SelectProviderOptions = {}
): ProviderSelection => {
  let mock: MockProviderHandle | undefined;
  const registry: ProviderRegistry = {
    mock: () => {
      assertMockProviderAllowed(env);
      assertProductionConfig(env, { provider: 'mock', demo: true });
      mock = createMock(env);
      return instrumentProvider(mock, 'mock');
    },
    sumsub: () => {
      assertSumsubSettings(env);
      assertProductionConfig(env, {
        provider: 'sumsub',
        demoSettings: sumsubDemoSettingsInUse(getConfig(env)),
      });
      return instrumentProvider(createSumsub(env), 'sumsub');
    },
  };

  const providerName = providerNameFromEnv(env, registry, { onUnknown: options.onUnknown });
  const provider = registry[providerName]();
  return mock ? { provider, providerName, mock } : { provider, providerName };
};

// The adapter alone, for callers that need nothing else
export const getProvider = (env: Env = process.env): VerificationProvider =>
  selectProvider(env).provider;

export type { VerificationProvider } from './port';
export { supportsHostedPage, supportsUserStatusLookup } from './port';
