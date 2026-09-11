// Hosted mode: the provider's web SDK runs on a page (this repo's packages/kyc-service,
// or any page speaking the bridge protocol) that the host embeds in a
// hardened WebView / origin-pinned iframe.
//
// This source only resolves *which* page to load and how to read it; the
// embedding is the platform package's job. Apollo-free by construction -
// hosts that get their session from somewhere else never need Apollo.

import { ErrorCodes } from '../errors';
import { interpretBridgeMessage } from './bridge';

import type {
  TokenRefreshableSource,
  VerificationSession,
  VerificationSource,
  VerificationSourceError,
} from './types';

/** Host seam: fetch a session however the host wants (its own API, cache, ...). */
export type HostedSessionProvider = () =>
  | VerificationSession
  | Promise<VerificationSession>;

/** Host seam: mint a fresh provider access token for a running page. */
export type HostedRefreshToken = (
  previous: VerificationSession,
) => Promise<string>;

export interface HostedSourceOptions {
  /** A ready page URL. Ignored when getSession is given. */
  url?: string;
  /** Resolve the session at start() time (preferred - URLs are short-lived). */
  getSession?: HostedSessionProvider;
  /** postMessage origin pin; used when the resolved session has none. */
  allowedOrigin?: string;
  /** Provider id recorded on the session when only a url is configured. */
  provider?: string;
  /** Supplying this makes the source a TokenRefreshableSource. */
  refreshToken?: HostedRefreshToken;
}

const DEFAULT_PROVIDER = 'hosted';

/**
 * Extract the origin (scheme + host + port) from a URL. Used instead of the
 * DOM `URL` global's `.origin`, which is unreliable on React Native (no
 * built-in `URL` on Hermes without a polyfill, and polyfilled origins can
 * differ subtly from the browser's). Returns undefined for anything that is
 * not a well-formed http(s) URL, rather than throwing.
 */
const originOf = (url: string): string | undefined =>
  /^(https?:\/\/[^/?#]+)/i.exec(url)?.[1];

const resolveSession = async (
  options: HostedSourceOptions,
): Promise<VerificationSession> => {
  if (options.getSession) {
    const session = await options.getSession();
    if (!session.url) {
      throw {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'getSession() returned a session without a url',
      } as VerificationSourceError;
    }
    return {
      ...session,
      allowedOrigin:
        session.allowedOrigin ?? options.allowedOrigin ?? originOf(session.url),
    };
  }

  if (!options.url) {
    throw {
      code: ErrorCodes.VALIDATION_ERROR,
      message:
        'createHostedSource requires either a url or a getSession callback',
    } as VerificationSourceError;
  }

  return {
    provider: options.provider ?? DEFAULT_PROVIDER,
    url: options.url,
    allowedOrigin: options.allowedOrigin ?? originOf(options.url),
  };
};

/** Supplying `refreshToken` makes the returned source a `TokenRefreshableSource`. */
export function createHostedSource(
  options: HostedSourceOptions & { refreshToken: HostedRefreshToken },
): TokenRefreshableSource;
export function createHostedSource(
  options: HostedSourceOptions,
): VerificationSource;
export function createHostedSource(
  options: HostedSourceOptions,
): VerificationSource {
  const start = (): Promise<VerificationSession> => resolveSession(options);
  const { refreshToken } = options;

  if (refreshToken) {
    const source: TokenRefreshableSource = {
      start,
      interpret: interpretBridgeMessage,
      refreshToken,
    };
    return source;
  }

  const source: VerificationSource = {
    start,
    interpret: interpretBridgeMessage,
  };
  return source;
}
