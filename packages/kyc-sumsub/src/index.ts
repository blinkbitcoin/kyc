// @blinkbitcoin/kyc-sumsub - the root entry: Sumsub <-> normalized mapping.
// Pure TypeScript (no DOM, no React Native, no @sumsub peer), so a backend,
// a web host and the React Native source can all depend on it.

export * from './mapping';
export * from './types';
export { SUMSUB_PROVIDER, sumsubSession } from './provider';
