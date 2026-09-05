/**
 * Wire-contract parity: the package's ErrorCodes map must exactly match the
 * ErrorCode enum generated from apps/api/schema.graphql. If this fails after
 * a schema change, run `npm run codegen` and update ErrorCodes.
 */

import { ErrorCodes, isKnownErrorCode } from '../errors';
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
