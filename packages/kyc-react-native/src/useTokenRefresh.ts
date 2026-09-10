// Hosted-mode token refresh.
//
// The page's SDK asks for a fresh token by posting `tokenExpired`; the app
// answers by calling window.__kycBridge.setToken(token) inside the WebView.
// createSetTokenScript builds exactly that call (bare, escaped token) - the
// page accepts it whether or not the envelope form is used.

import { useCallback, useEffect, useRef } from 'react';
import {
  ClientErrorCodes,
  createSetTokenScript,
  isTokenRefreshable,
  toIdentityVerificationError,
} from '@blinkbitcoin/kyc-core/hosted';

import type { MutableRefObject } from 'react';
import type {
  IdentityVerificationError,
  VerificationSession,
  VerificationSource,
  VerificationSourceError,
} from '@blinkbitcoin/kyc-core/hosted';

/** The slice of react-native-webview's ref this package needs. */
export interface TokenInjectable {
  injectJavaScript(script: string): void;
}

export interface UseTokenRefreshOptions {
  /** The running session, or null when there is none to refresh. */
  getSession: () => VerificationSession | null;
  /** Where a fresh token is pushed - the WebView showing the hosted page. */
  target: MutableRefObject<TokenInjectable | null>;
  /** TOKEN_EXPIRED (cannot refresh) or TOKEN_REFRESH_FAILED (refresh failed). */
  onFailure: (error: IdentityVerificationError) => void;
}

/**
 * Which session a token belongs to. A restart mints a new session while the
 * old refresh may still be in flight; injecting its token would hand the page
 * a credential for a session that no longer exists.
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
  // Only the newest refresh may inject: a second tokenExpired supersedes the
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
    if (!isTokenRefreshable(current) || !session) {
      optionsRef.current.onFailure(
        toIdentityVerificationError(ClientErrorCodes.TOKEN_EXPIRED),
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
        optionsRef.current.target.current?.injectJavaScript(
          createSetTokenScript(token),
        );
      },
      (cause: VerificationSourceError | undefined) => {
        if (!mountedRef.current || seq !== seqRef.current) {
          return;
        }
        optionsRef.current.onFailure(
          toIdentityVerificationError(
            ClientErrorCodes.TOKEN_REFRESH_FAILED,
            cause?.message,
          ),
        );
      },
    );
  }, []);
};
