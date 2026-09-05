// Proxy mode: the backend owns the provider session. start() creates it,
// refreshToken() mints a new provider access token for the hosted page, and
// interpret() reads that page's bridge messages.
//
// Pulls in @apollo/client (via ../client and ../operations), so this module
// is reachable only from the full `.` entry.

import { getApolloErrorCode } from '../client';
import { ClientErrorCodes, ErrorCodes } from '../errors';
import {
  VERIFICATION_SESSION_REFRESH_MUTATION,
  VERIFICATION_SESSION_START_MUTATION,
  type VerificationPlatform,
  type VerificationSessionRefreshResult,
  type VerificationSessionStartInput,
  type VerificationSessionStartResult,
} from '../operations';
import { interpretBridgeMessage } from './bridge';

import type { ApolloClient } from '@apollo/client';
import type {
  TokenRefreshableSource,
  VerificationSession,
  VerificationSourceError,
} from './types';

/**
 * Sentinel error class for every rejection this module throws. Tagging with
 * `instanceof` (rather than duck-typing on `'code' in error`) keeps foreign
 * coded errors - a `DOMException` AbortError (`.code === 20`), a Node error
 * with `.code === 'ECONNREFUSED'` - from being mistaken for one of ours and
 * rethrown unmapped. The shape stays assignable to `VerificationSourceError`.
 */
class SourceError extends Error implements VerificationSourceError {
  code: string;

  constructor(code: string, message?: string) {
    super(message);
    this.code = code;
  }
}

const isCoded = (error: unknown): error is SourceError =>
  error instanceof SourceError;

export interface ProxySourceOptions {
  /** Apollo client wired to the verification backend (createKycApolloClient). */
  client: ApolloClient;
  /** Where the flow runs - selects the provider token flavour. */
  platform: VerificationPlatform;
  /** Provider verification level (defaults to the backend's own default). */
  levelName?: string;
  /** BCP-47 locale for the provider UI. */
  locale?: string;
}

export const createProxySource = (
  options: ProxySourceOptions,
): TokenRefreshableSource => ({
  async start(): Promise<VerificationSession> {
    try {
      const { data } = await options.client.mutate<
        VerificationSessionStartResult,
        { input: VerificationSessionStartInput }
      >({
        mutation: VERIFICATION_SESSION_START_MUTATION,
        variables: {
          input: {
            platform: options.platform,
            levelName: options.levelName,
            locale: options.locale,
          },
        },
      });

      const session = data?.verificationSessionStart;
      if (!session) {
        throw new SourceError(ErrorCodes.SESSION_CREATION_FAILED);
      }

      return {
        provider: session.provider,
        sessionId: session.sessionId,
        accessToken: session.accessToken ?? undefined,
        url: session.url ?? undefined,
        allowedOrigin: session.allowedOrigin ?? undefined,
        applicantId: session.applicantId ?? undefined,
      };
    } catch (error) {
      if (isCoded(error)) {
        throw error;
      }
      throw new SourceError(
        getApolloErrorCode(error, ErrorCodes.SESSION_CREATION_FAILED),
        error instanceof Error ? error.message : undefined,
      );
    }
  },

  async refreshToken(previous: VerificationSession): Promise<string> {
    if (!previous.sessionId) {
      throw new SourceError(
        ClientErrorCodes.TOKEN_REFRESH_FAILED,
        'the session has no sessionId to refresh',
      );
    }

    try {
      const { data } = await options.client.mutate<
        VerificationSessionRefreshResult,
        { sessionId: string }
      >({
        mutation: VERIFICATION_SESSION_REFRESH_MUTATION,
        variables: { sessionId: previous.sessionId },
      });

      const token = data?.verificationSessionRefresh.accessToken;
      if (!token) {
        throw new SourceError(ClientErrorCodes.TOKEN_REFRESH_FAILED);
      }
      return token;
    } catch (error) {
      if (isCoded(error)) {
        throw error;
      }
      throw new SourceError(
        getApolloErrorCode(error, ClientErrorCodes.TOKEN_REFRESH_FAILED),
        error instanceof Error ? error.message : undefined,
      );
    }
  },

  interpret: interpretBridgeMessage,
});
