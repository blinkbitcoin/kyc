// Wire-contract error codes as a const map (mirrors the schema enum; parity
// is tested against src/generated/error-code.ts). Client-side codes join
// this map in the core phase.
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
} as const;

export type ErrorCodeValue = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const isKnownErrorCode = (code: string): code is ErrorCodeValue =>
  Object.values(ErrorCodes).includes(code as ErrorCodeValue);
