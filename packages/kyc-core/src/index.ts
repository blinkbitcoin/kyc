// @blinkbitcoin/kyc-core - platform-agnostic core shared by the RN and web
// verification packages.
//
// This entry needs the optional @apollo/client + graphql peers (proxy mode).
// Hosts that only embed a hosted page import ./hosted instead, which is
// Apollo-free by construction (guard-tested in src/__tests__).

export * from './verification';

export {
  ErrorCodes,
  ClientErrorCodes,
  isKnownErrorCode,
  isClientErrorCode,
} from './errors';
export type {
  AnyErrorCodeValue,
  ClientErrorCodeValue,
  ErrorCodeValue,
} from './errors';
export { ErrorCode } from './generated/error-code';

export { createProxySource } from './verification/proxySource';
export type { ProxySourceOptions } from './verification/proxySource';

export {
  createAuthContextSetter,
  createKycApolloClient,
  getApolloErrorCode,
  handleApolloErrors,
} from './client';
export type { GetAuthToken, KycApolloClientOptions } from './client';

export {
  VERIFICATION_SESSION_QUERY,
  VERIFICATION_SESSION_REFRESH_MUTATION,
  VERIFICATION_SESSION_START_MUTATION,
} from './operations';
export type {
  GetVerificationSessionResult,
  VerificationPlatform,
  VerificationSessionRefreshResult,
  VerificationSessionStartInput,
  VerificationSessionStartResult,
} from './operations';
