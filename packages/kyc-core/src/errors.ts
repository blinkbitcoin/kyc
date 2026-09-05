// Error codes, split by origin.
//
// ErrorCodes: the GraphQL wire contract. Parity with the enum generated from
// apps/api/schema.graphql is asserted in src/__tests__/wire-contract.test.ts.
//
// ClientErrorCodes: codes that only ever originate on the client (network,
// permissions, missing native SDK, token/bridge handling). They deliberately
// do NOT exist in the schema enum - a backend must never send them.
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
} as const;

export type ErrorCodeValue = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ClientErrorCodes = {
  /**
   * Request never reached the backend (or the device is offline). Intended
   * producer: the platform packages' own connectivity check / offline state
   * (Phase 5-6), not this package - `createProxySource` deliberately maps
   * transport failures it sees itself to `SESSION_CREATION_FAILED` /
   * `TOKEN_REFRESH_FAILED` instead, since at that point a request was
   * already attempted.
   */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** Camera/microphone permission denied or blocked by the OS. */
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  /** The provider's native/web SDK is not installed in this build. */
  SDK_UNAVAILABLE: 'SDK_UNAVAILABLE',
  /** The provider access token expired and could not be replaced. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** A token refresh was attempted and failed. */
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  /** The hosted page sent a malformed or unsupported bridge message. */
  BRIDGE_PROTOCOL: 'BRIDGE_PROTOCOL',
} as const;

export type ClientErrorCodeValue =
  (typeof ClientErrorCodes)[keyof typeof ClientErrorCodes];

/** Every code getErrorMessage knows about. */
export type AnyErrorCodeValue = ErrorCodeValue | ClientErrorCodeValue;

export const isKnownErrorCode = (code: string): code is ErrorCodeValue =>
  Object.values(ErrorCodes).includes(code as ErrorCodeValue);

export const isClientErrorCode = (code: string): code is ClientErrorCodeValue =>
  Object.values(ClientErrorCodes).includes(code as ClientErrorCodeValue);
