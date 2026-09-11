import {
  createError,
  ErrorCodes,
  Errors,
  getErrorCode,
  KycError,
} from '../errors';

describe('createError', () => {
  it('builds a KycError carrying the code on itself and in extensions', () => {
    const err = createError(ErrorCodes.VALIDATION_ERROR, 'bad input');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KycError);
    expect(err.name).toBe('KycError');
    expect(err.message).toBe('bad input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.extensions.code).toBe('VALIDATION_ERROR');
  });
});

describe('Errors factories', () => {
  it('each factory uses its own code and a default message', () => {
    expect(Errors.unauthorized().extensions.code).toBe('UNAUTHORIZED');
    expect(Errors.sessionNotFound().extensions.code).toBe('SESSION_NOT_FOUND');
    expect(Errors.sessionCreationFailed().extensions.code).toBe(
      'SESSION_CREATION_FAILED',
    );
    expect(Errors.providerUnavailable().extensions.code).toBe(
      'PROVIDER_UNAVAILABLE',
    );
    expect(Errors.persistenceFailed().extensions.code).toBe(
      'PERSISTENCE_FAILED',
    );
    expect(Errors.validationError('x').extensions.code).toBe(
      'VALIDATION_ERROR',
    );
    expect(Errors.validationError('x').message).toBe('x');
  });

  it('accepts a custom message', () => {
    expect(Errors.unauthorized('nope').message).toBe('nope');
    expect(Errors.sessionNotFound('gone').message).toBe('gone');
    expect(Errors.sessionCreationFailed('boom').message).toBe('boom');
    expect(Errors.providerUnavailable('down').message).toBe('down');
    expect(Errors.persistenceFailed('db').message).toBe('db');
  });
});

describe('getErrorCode', () => {
  it('reads a coded error, a GraphQL-shaped error and a plain object', () => {
    expect(getErrorCode(Errors.sessionNotFound())).toBe('SESSION_NOT_FOUND');
    expect(getErrorCode({ extensions: { code: 'X' } })).toBe('X');
    expect(getErrorCode({ code: 'Y' })).toBe('Y');
  });

  it('is undefined for anything without a string code', () => {
    expect(getErrorCode(new Error('plain'))).toBeUndefined();
    expect(getErrorCode({ extensions: { code: 7 } })).toBeUndefined();
    expect(getErrorCode('string')).toBeUndefined();
    expect(getErrorCode(null)).toBeUndefined();
  });
});
