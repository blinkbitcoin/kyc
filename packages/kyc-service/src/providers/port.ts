// The identity-verification provider PORT is the package's; the registry
// (index.ts) selects an adapter and wraps it in tracing. Nothing
// provider-specific leaks past this boundary.

export type { HostedPageRenderer, VerificationProvider } from '@blinkbitcoin/kyc-node';
export { supportsHostedPage, supportsUserStatusLookup } from '@blinkbitcoin/kyc-node';
