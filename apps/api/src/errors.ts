import { GraphQLError } from 'graphql';

// Error codes as const object for type safety. This list IS the wire
// contract: tests/schema-artifact.test.ts asserts it matches the ErrorCode
// enum in src/typeDefs.ts, and packages/kyc-core regenerates its enum from
// the emitted schema.graphql (`make codegen`).
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const createError = (code: ErrorCode, message: string): GraphQLError =>
  new GraphQLError(message, { extensions: { code } });

export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    createError(ErrorCodes.UNAUTHORIZED, message),
  validationError: (message: string) => createError(ErrorCodes.VALIDATION_ERROR, message),
  providerUnavailable: (message = 'Verification service temporarily unavailable') =>
    createError(ErrorCodes.PROVIDER_UNAVAILABLE, message),
  sessionNotFound: (message = 'Verification session not found') =>
    createError(ErrorCodes.SESSION_NOT_FOUND, message),
  sessionCreationFailed: (message = 'Failed to create verification session') =>
    createError(ErrorCodes.SESSION_CREATION_FAILED, message),
  persistenceFailed: (message = 'Failed to save verification data') =>
    createError(ErrorCodes.PERSISTENCE_FAILED, message),
};
