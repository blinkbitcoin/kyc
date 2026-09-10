// The verification-source abstraction: the seam that lets one <IdentityVerification>
// component drive any provider in any mode (native SDK, hosted page, proxy).
//
// Platform-agnostic (no React, no WebView/iframe, no native module) -
// identical in the web and React Native packages. Only the component that
// embeds/launches differs per platform.

/** Normalized applicant status, regardless of provider. */
export type IdentityVerificationStatus =
  | 'initial'
  | 'incomplete'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'finallyRejected';

/**
 * The runtime companion to IdentityVerificationStatus, in lifecycle order. Untrusted
 * input (bridge messages, provider payloads) is validated against this list.
 */
export const IDENTITY_VERIFICATION_STATUSES: readonly IdentityVerificationStatus[] =
  [
    'initial',
    'incomplete',
    'pending',
    'approved',
    'declined',
    'finallyRejected',
  ] as const;

/** Narrow untrusted input to a normalized status. */
export const isIdentityVerificationStatus = (
  value: unknown,
): value is IdentityVerificationStatus =>
  typeof value === 'string' &&
  (IDENTITY_VERIFICATION_STATUSES as readonly string[]).includes(value);

/** Normalized event the component acts on, regardless of provider. */
export type VerificationEvent =
  | { type: 'applicantLoaded'; applicantId: string }
  | { type: 'submitted' }
  | { type: 'statusChanged'; status: IdentityVerificationStatus }
  | {
      type: 'complete';
      status: IdentityVerificationStatus;
      applicantId?: string;
    }
  | { type: 'cancel' }
  /** Hosted mode only: the page's token expired; a refreshable source can mint a new one. */
  | { type: 'tokenExpired' }
  /** The session itself is over and cannot be refreshed - restart from scratch. */
  | { type: 'sessionExpired' }
  | { type: 'error'; code: string; message?: string };

/** A resolved verification session: what a mode needs to run it. */
export interface VerificationSession {
  /** Provider id, e.g. 'sumsub' or 'mock'. */
  provider: string;
  /** Backend session id (proxy mode). */
  sessionId?: string;
  /** Provider access token (native / web SDK modes). */
  accessToken?: string;
  /** Page URL to embed (hosted mode). */
  url?: string;
  /** Origin to accept postMessage from (hosted mode, defense in depth). */
  allowedOrigin?: string;
  applicantId?: string;
  /** The applicant's status as of session creation/refresh, when the backend reports it. */
  status?: IdentityVerificationStatus;
}

/** Terminal outcome handed to onComplete. */
export interface IdentityVerificationResult {
  status: IdentityVerificationStatus;
  applicantId?: string;
}

/** Rejection shape from start() so the component can show a code. */
export interface VerificationSourceError {
  code: string;
  message?: string;
}

/**
 * A verification mode: knows how to acquire its session and read its own
 * events. Adding a provider or mode = a new VerificationSource; the
 * component never changes (Open/Closed).
 */
export interface VerificationSource {
  start(): Promise<VerificationSession>;
  /** Translate a raw embedded-page message into a normalized event, or null. */
  interpret(message: unknown): VerificationEvent | null;
}

/** Hosted mode: a source that can mint a fresh access token for the page. */
export interface TokenRefreshableSource extends VerificationSource {
  refreshToken(previous: VerificationSession): Promise<string>;
}

/** Native SDK mode: a source that runs the provider's SDK in-process. */
export interface LaunchableSource extends VerificationSource {
  /**
   * `launch` resolves the terminal `IdentityVerificationResult`. A `cancel` event
   * emitted before resolution means the user aborted; the resolved status
   * is then advisory (typically `incomplete`). Implementations reject with
   * a `VerificationSourceError` only for failures, never for user
   * cancellation.
   */
  launch(
    session: VerificationSession,
    onEvent: (event: VerificationEvent) => void,
  ): Promise<IdentityVerificationResult>;
}

/** Capability checks - structural (duck-typed), not nominal. */
export const isTokenRefreshable = (
  source: VerificationSource,
): source is TokenRefreshableSource =>
  typeof (source as TokenRefreshableSource).refreshToken === 'function';

export const isLaunchable = (
  source: VerificationSource,
): source is LaunchableSource =>
  typeof (source as LaunchableSource).launch === 'function';

/**
 * Color overrides for the default IdentityVerification UI, one set for both
 * platforms; a per-element `styles` prop on the component wins over it.
 */
export interface IdentityVerificationTheme {
  /** Primary button background, secondary button text, the spinner. */
  primaryColor?: string;
  /** Text on the primary button. */
  primaryTextColor?: string;
  /** Titles. */
  textColor?: string;
  /** Subtitles and hints. */
  mutedTextColor?: string;
  successColor?: string;
  errorColor?: string;
  fontFamily?: string;
}
