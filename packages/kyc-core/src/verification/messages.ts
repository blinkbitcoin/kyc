// User-facing copy for every error code, schema-borne and client-side.
// Components render getErrorMessage(code, serverMessage) - never a raw code.
// Apollo-free: part of the ./hosted entry.

import { ClientErrorCodes, ErrorCodes } from '../errors';

export const getErrorMessage = (
  code: string,
  serverMessage?: string,
): string => {
  switch (code) {
    // --- schema-borne (packages/kyc-service ErrorCode enum) ---
    case ErrorCodes.UNAUTHORIZED:
      return 'You are not authorized to start identity verification.';
    case ErrorCodes.VALIDATION_ERROR:
      return serverMessage || 'Invalid input. Please check your information.';
    case ErrorCodes.PROVIDER_UNAVAILABLE:
      return 'Verification service temporarily unavailable. Please try again later.';
    case ErrorCodes.SESSION_NOT_FOUND:
      return 'Verification session not found. Please start again.';
    case ErrorCodes.SESSION_CREATION_FAILED:
      return 'Unable to start identity verification. Please try again.';
    case ErrorCodes.PERSISTENCE_FAILED:
      return 'Your verification session could not be saved. Please try again.';

    // --- client-side only ---
    case ClientErrorCodes.NETWORK_ERROR:
      return 'Connection lost. Please check your network and try again.';
    case ClientErrorCodes.PERMISSION_DENIED:
      return 'Camera access is required to verify your identity.';
    case ClientErrorCodes.SDK_UNAVAILABLE:
      return 'Identity verification is unavailable in this build.';
    case ClientErrorCodes.TOKEN_EXPIRED:
      return 'Your verification session expired. Please start again.';
    case ClientErrorCodes.TOKEN_REFRESH_FAILED:
      return 'Could not refresh your verification session. Please try again.';
    case ClientErrorCodes.BRIDGE_PROTOCOL:
      return 'The verification page sent an unsupported message. Please update the app.';

    default:
      return serverMessage || 'An error occurred. Please try again.';
  }
};
