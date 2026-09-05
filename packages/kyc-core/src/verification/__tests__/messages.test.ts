import { ClientErrorCodes, ErrorCodes } from '../../errors';
import { getErrorMessage } from '../messages';

describe('getErrorMessage - schema-borne codes', () => {
  it.each([
    [
      ErrorCodes.UNAUTHORIZED,
      'You are not authorized to start identity verification.',
    ],
    [
      ErrorCodes.PROVIDER_UNAVAILABLE,
      'Verification service temporarily unavailable. Please try again later.',
    ],
    [
      ErrorCodes.SESSION_NOT_FOUND,
      'Verification session not found. Please start again.',
    ],
    [
      ErrorCodes.SESSION_CREATION_FAILED,
      'Unable to start identity verification. Please try again.',
    ],
    [
      ErrorCodes.PERSISTENCE_FAILED,
      'Your verification session could not be saved. Please try again.',
    ],
  ])('maps %s to its message', (code, expected) => {
    expect(getErrorMessage(code)).toBe(expected);
  });

  it('uses the server message for VALIDATION_ERROR, with a fallback', () => {
    expect(
      getErrorMessage(ErrorCodes.VALIDATION_ERROR, 'Locale is invalid'),
    ).toBe('Locale is invalid');
    expect(getErrorMessage(ErrorCodes.VALIDATION_ERROR)).toBe(
      'Invalid input. Please check your information.',
    );
  });
});

describe('getErrorMessage - client-side codes', () => {
  it.each([
    [
      ClientErrorCodes.NETWORK_ERROR,
      'Connection lost. Please check your network and try again.',
    ],
    [
      ClientErrorCodes.PERMISSION_DENIED,
      'Camera access is required to verify your identity.',
    ],
    [
      ClientErrorCodes.SDK_UNAVAILABLE,
      'Identity verification is unavailable in this build.',
    ],
    [
      ClientErrorCodes.TOKEN_EXPIRED,
      'Your verification session expired. Please start again.',
    ],
    [
      ClientErrorCodes.TOKEN_REFRESH_FAILED,
      'Could not refresh your verification session. Please try again.',
    ],
    [
      ClientErrorCodes.BRIDGE_PROTOCOL,
      'The verification page sent an unsupported message. Please update the app.',
    ],
  ])('maps %s to its message', (code, expected) => {
    expect(getErrorMessage(code)).toBe(expected);
  });
});

describe('getErrorMessage - unknown codes', () => {
  it('prefers the server message, then a generic message', () => {
    expect(getErrorMessage('SOME_NEW_CODE', 'raw detail')).toBe('raw detail');
    expect(getErrorMessage('SOME_NEW_CODE')).toBe(
      'An error occurred. Please try again.',
    );
  });
});
