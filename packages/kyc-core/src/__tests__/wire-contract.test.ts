/**
 * Wire-contract parity: the package's ErrorCodes map must exactly match the
 * ErrorCode enum generated from apps/api/schema.graphql. If this fails after
 * a schema change, run `npm run codegen` and update ErrorCodes.
 */

import {
  ClientErrorCodes,
  ErrorCodes,
  isClientErrorCode,
  isKnownErrorCode,
} from '../errors';
import { ErrorCode } from '../generated/error-code';

describe('ErrorCodes wire contract', () => {
  it('matches the schema-generated ErrorCode enum exactly', () => {
    expect(Object.values(ErrorCodes).sort()).toEqual(
      Object.values(ErrorCode).sort(),
    );
  });

  it('isKnownErrorCode recognizes contract codes only', () => {
    expect(isKnownErrorCode('UNAUTHORIZED')).toBe(true);
    expect(isKnownErrorCode('NOPE')).toBe(false);
  });
});

describe('ClientErrorCodes', () => {
  it('never overlaps the schema-borne wire contract', () => {
    const schemaCodes = new Set<string>(Object.values(ErrorCodes));
    for (const code of Object.values(ClientErrorCodes)) {
      expect(schemaCodes.has(code)).toBe(false);
    }
  });

  it('lists exactly the six client-side codes, each keyed by its own value', () => {
    expect(Object.values(ClientErrorCodes).sort()).toEqual(
      [
        'BRIDGE_PROTOCOL',
        'NETWORK_ERROR',
        'PERMISSION_DENIED',
        'SDK_UNAVAILABLE',
        'TOKEN_EXPIRED',
        'TOKEN_REFRESH_FAILED',
      ].sort(),
    );
    for (const [key, value] of Object.entries(ClientErrorCodes)) {
      expect(value).toBe(key);
    }
  });

  it('isClientErrorCode recognizes client codes only', () => {
    expect(isClientErrorCode('NETWORK_ERROR')).toBe(true);
    expect(isClientErrorCode('UNAUTHORIZED')).toBe(false);
    expect(isClientErrorCode('NOPE')).toBe(false);
  });

  it('isKnownErrorCode still recognizes schema codes only', () => {
    expect(isKnownErrorCode('SESSION_NOT_FOUND')).toBe(true);
    expect(isKnownErrorCode('NETWORK_ERROR')).toBe(false);
  });
});
