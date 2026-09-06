// The hardened iframe configuration and the inbound-message guard, as data.
//
// Every security-relevant decision about embedding the hosted page lives here
// so it can be unit tested as a plain object / a plain predicate and reviewed
// in one place:
//   - `allow` delegates camera and microphone to the frame. Without this the
//     provider's liveness step cannot open the camera at all, which is the
//     class of bug this whole library exists to fix. The EMBEDDING page must
//     itself be permitted to use them (its own Permissions-Policy) for the
//     delegation to land.
//   - `sandbox` keeps allow-scripts (the page is a JS app), allow-forms (some
//     provider steps post a form) and allow-same-origin. allow-same-origin is
//     REQUIRED: the provider web SDK the page loads uses its own storage, and
//     in a sandboxed frame without it the page is given an opaque origin and
//     every storage access throws. It does not weaken the host: the page is
//     served from a different origin than the host app, so "same origin"
//     means the page's own origin, not the host's. (If you ever serve the
//     hosted page from your app's own origin, drop the sandbox attribute
//     instead of keeping this combination - it would be a no-op there.)
//     Popups, top-level navigation, downloads and pointer lock stay denied.
//   - `referrerPolicy` sends the host origin and nothing more.
//
// The origin pin is NOT here by accident: the hosted page posts to
// `window.parent` with a target origin of '*' and does not check
// `event.origin` itself, so the receiving side is the only place the trust
// boundary can be drawn. createMessageGuard draws it.

/** Capability delegation the provider's liveness/document capture needs. */
export const FRAME_ALLOW = 'camera; microphone';

/** See the note above - allow-same-origin is required by the provider SDK. */
export const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms';

export const FRAME_REFERRER_POLICY = 'strict-origin-when-cross-origin';

export interface HardenedFrameProps {
  src: string;
  title: string;
  allow: string;
  sandbox: string;
  referrerPolicy: typeof FRAME_REFERRER_POLICY;
  loading: 'eager';
}

export interface HostedFrameOptions {
  /** The hosted page URL from the session. */
  url: string;
  /** Accessible name for the frame. */
  title: string;
}

export const createHostedFrameProps = ({
  url,
  title,
}: HostedFrameOptions): HardenedFrameProps => ({
  src: url,
  title,
  allow: FRAME_ALLOW,
  sandbox: FRAME_SANDBOX,
  referrerPolicy: FRAME_REFERRER_POLICY,
  // The flow starts the moment the component renders; never defer the load.
  loading: 'eager',
});

/** The two fields of a MessageEvent the guard judges. */
export interface GuardableMessage {
  origin: string;
  source: unknown;
}

export interface MessageGuardOptions {
  /** The session's origin pin. Undefined means "nothing may be trusted". */
  allowedOrigin?: string;
  /** The frame's content window, read late (it changes as the frame loads). */
  getFrameWindow: () => Window | null;
}

/**
 * Accept a page message only when it came from the pinned origin AND from the
 * frame this component rendered. The origin check alone is not enough: any
 * other frame on the page could be navigated to the same origin. Without a
 * pin nothing is accepted - failing closed is the only safe default, since
 * the alternative is trusting arbitrary cross-origin senders.
 */
export const createMessageGuard =
  ({ allowedOrigin, getFrameWindow }: MessageGuardOptions) =>
  (event: GuardableMessage): boolean => {
    if (!allowedOrigin || event.origin !== allowedOrigin) {
      return false;
    }
    const frameWindow = getFrameWindow();
    return frameWindow !== null && event.source === frameWindow;
  };
