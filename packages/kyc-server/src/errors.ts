// Coded errors: the wire contract shared with the client packages (their
// generated ErrorCode enum maps onto these codes). Framework neutral - a
// GraphQL layer surfaces `extensions.code` (graphql-js copies a thrown
// error's extensions), an HTTP layer maps codes to statuses.

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** An error with a code; `extensions.code` mirrors GraphQL's convention. */
export class KycError extends Error {
  readonly code: ErrorCode;
  readonly extensions: { code: ErrorCode };

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'KycError';
    this.code = code;
    this.extensions = { code };
  }
}

export const createError = (code: ErrorCode, message: string): KycError =>
  new KycError(code, message);

export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    createError(ErrorCodes.UNAUTHORIZED, message),
  validationError: (message: string) =>
    createError(ErrorCodes.VALIDATION_ERROR, message),
  providerUnavailable: (
    message = 'Verification service temporarily unavailable',
  ) => createError(ErrorCodes.PROVIDER_UNAVAILABLE, message),
  sessionNotFound: (message = 'Verification session not found') =>
    createError(ErrorCodes.SESSION_NOT_FOUND, message),
  sessionCreationFailed: (message = 'Failed to create verification session') =>
    createError(ErrorCodes.SESSION_CREATION_FAILED, message),
  persistenceFailed: (message = 'Failed to save verification data') =>
    createError(ErrorCodes.PERSISTENCE_FAILED, message),
};

/**
 * The code carried by any error shape we produce or receive (coded errors,
 * GraphQL errors with extensions, plain objects with a code), else undefined.
 */
export const getErrorCode = (error: unknown): string | undefined => {
  if (error && typeof error === 'object') {
    const candidate = error as {
      extensions?: { code?: unknown };
      code?: unknown;
    };
    const code = candidate.extensions?.code ?? candidate.code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
};
