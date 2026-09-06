import { instrumentProvider } from '../tracing';
import { assertMockProviderAllowed, MockProvider } from './mock';
import type { VerificationProvider } from './port';
import { SumsubProvider, validateConfig as validateSumsubConfig } from './sumsub';

export const PROVIDER_NAMES = ['mock', 'sumsub'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const isKnownProvider = (name: string): name is ProviderName =>
  (PROVIDER_NAMES as readonly string[]).includes(name);

/** The provider this process is configured for (unknown values read as mock). */
export const getProviderName = (env: NodeJS.ProcessEnv = process.env): ProviderName => {
  const name = env.KYC_PROVIDER ?? 'mock';
  return isKnownProvider(name) ? name : 'mock';
};

export const getProvider = (providerName?: string): VerificationProvider => {
  const name = providerName ?? process.env.KYC_PROVIDER ?? 'mock';

  switch (name) {
    case 'mock':
      // Fail fast at boot rather than on the first forged webhook.
      assertMockProviderAllowed();
      return instrumentProvider(MockProvider, 'mock');
    case 'sumsub':
      // Fail fast at boot rather than on the first session.
      validateSumsubConfig();
      return instrumentProvider(SumsubProvider, 'sumsub');
    default:
      console.warn(`Unknown KYC_PROVIDER: ${name}, falling back to mock`);
      assertMockProviderAllowed();
      return instrumentProvider(MockProvider, 'mock');
  }
};

export const provider = getProvider();

export type { VerificationProvider } from './port';
export { supportsUserStatusLookup } from './port';
