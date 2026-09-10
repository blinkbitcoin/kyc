// Hosted-mode token refresh, web edition.
//
// The page's SDK asks for a fresh token by posting `tokenExpired`; the app
// answers by posting the full setToken envelope back into the iframe. The
// envelope form (not the bare-token injected script the React Native package
// uses) is what a cross-origin page can safely validate: examples/full-service-demo's hosted
// page checks `source` and `v` before touching the token.
//
// The target origin is ALWAYS session.allowedOrigin and never '*': a wildcard
// would hand the token to whatever document happens to occupy the frame. A
// session without an allowedOrigin therefore cannot be refreshed at all - it
// fails closed with TOKEN_EXPIRED, which keeps the session so the error
// screen can offer Restart.

import { useCallback, useEffect, useRef } from 'react';
import {
  ClientErrorCodes,
  createSetTokenMessage,
  isTokenRefreshable,
  toVerificationError,
} from '@blinkbitcoin/kyc-core/hosted';

import type { RefObject } from 'react';
import type {
  VerificationError,
  VerificationSession,
  VerificationSource,
  VerificationSourceError,
} from '@blinkbitcoin/kyc-core/hosted';

/**
 * The slice of an HTMLIFrameElement this package needs. Declared structurally
 * so tests can pass a two-field double and so nothing here depends on the
 * full DOM element type.
 */
export interface TokenPostable {
  contentWindow: Pick<Window, 'postMessage'> | null;
}

export interface UseTokenRefreshOptions {
  /** The running session, or null when there is none to refresh. */
  getSession: () => VerificationSession | null;
  /** Where a fresh token is posted - the iframe showing the hosted page. */
  target: RefObject<TokenPostable | null>;
  /** TOKEN_EXPIRED (cannot refresh) or TOKEN_REFRESH_FAILED (refresh failed). */
  onFailure: (error: VerificationError) => void;
}

/**
 * Which session a token belongs to. A restart mints a new session while the
 * old refresh may still be in flight; posting its token would hand the page a
 * credential for a session that no longer exists.
 */
const identityOf = (session: VerificationSession): string | undefined =>
  session.sessionId ?? session.url;

export const useTokenRefresh = (
  source: VerificationSource,
  options: UseTokenRefreshOptions,
): (() => void) => {
  const sourceRef = useRef(source);
  const optionsRef = useRef(options);
  const mountedRef = useRef(true);
  // Only the newest refresh may post: a second tokenExpired supersedes the
  // first, so a stale token can never overwrite a fresh one. The session the
  // refresh was dispatched for is checked too - see identityOf.
  const seqRef = useRef(0);

  useEffect(() => {
    sourceRef.current = source;
    optionsRef.current = options;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(() => {
    const current = sourceRef.current;
    const session = optionsRef.current.getSession();
    const allowedOrigin = session?.allowedOrigin;
    if (!isTokenRefreshable(current) || !session || !allowedOrigin) {
      optionsRef.current.onFailure(
        toVerificationError(ClientErrorCodes.TOKEN_EXPIRED),
      );
      return;
    }

    seqRef.current += 1;
    const seq = seqRef.current;
    const identity = identityOf(session);
    current.refreshToken(session).then(
      token => {
        const settled = optionsRef.current.getSession();
        if (
          !mountedRef.current ||
          seq !== seqRef.current ||
          !settled ||
          identityOf(settled) !== identity
        ) {
          return;
        }
        optionsRef.current.target.current?.contentWindow?.postMessage(
          createSetTokenMessage(token),
          allowedOrigin,
        );
      },
      (cause: VerificationSourceError | undefined) => {
        if (!mountedRef.current || seq !== seqRef.current) {
          return;
        }
        optionsRef.current.onFailure(
          toVerificationError(
            ClientErrorCodes.TOKEN_REFRESH_FAILED,
            cause?.message,
          ),
        );
      },
    );
  }, []);
};
