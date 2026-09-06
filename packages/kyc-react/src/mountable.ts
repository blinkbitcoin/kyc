// The web-SDK mount seam.
//
// It lives in this package rather than in @blinkbitcoin/kyc-core precisely so
// that HTMLElement - a DOM type - never enters the platform-agnostic core,
// exactly as esign keeps MountableSigningSource in its web package. Detection
// is structural, like core's isLaunchable / isTokenRefreshable.
//
// v1 ships NO implementation: Sumsub's web SDK is itself an iframe, so the
// hosted mode already covers the browser (see the design's YAGNI cuts). This
// is the seam the deferred @blinkbitcoin/kyc-sumsub/web adapter will fill.

import type {
  VerificationEvent,
  VerificationSession,
  VerificationSource,
} from '@blinkbitcoin/kyc-core';

/**
 * Web-only capability: a source that renders itself into a container instead
 * of being embedded as a URL.
 */
export interface MountableSource extends VerificationSource {
  /**
   * Render the verification UI into `container` for `session` and forward
   * normalized events to `onEvent`. Returns the cleanup to run on unmount or
   * restart. Anything that needs to be fetched first (an SDK bundle, a token)
   * belongs in `start()`, where a rejection already becomes an error state.
   */
  mount(
    container: HTMLElement,
    session: VerificationSession,
    onEvent: (event: VerificationEvent) => void,
  ): () => void;
}

/** Capability check - structural (duck-typed), not nominal. */
export const isMountable = (
  source: VerificationSource,
): source is MountableSource =>
  typeof (source as MountableSource).mount === 'function';
