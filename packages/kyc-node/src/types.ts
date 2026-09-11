// The server-side domain vocabulary. The six statuses and three platforms
// are the SAME values as the SDL enums in src/graphql.ts (and therefore in
// @blinkbitcoin/kyc-core's generated types); src/__tests__/graphql.test.ts
// pins them to the SDL.

/** Normalized applicant status - same six values as the SDL enum. */
export type VerificationStatus =
  | 'initial'
  | 'incomplete'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'finallyRejected';

export const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  'initial',
  'incomplete',
  'pending',
  'approved',
  'declined',
  'finallyRejected',
];

export const isVerificationStatus = (
  value: unknown,
): value is VerificationStatus =>
  typeof value === 'string' &&
  (VERIFICATION_STATUSES as readonly string[]).includes(value);

/**
 * Statuses a session can never leave. `declined` is deliberately NOT here:
 * Sumsub's RETRY rejection lets an applicant resubmit, so declined may move
 * back to pending and on to approved.
 */
export const TERMINAL_STATUSES: ReadonlySet<VerificationStatus> =
  new Set<VerificationStatus>(['approved', 'finallyRejected']);

/** Where the verification runs - selects the provider token flavour. */
export type VerificationPlatform = 'WEB' | 'IOS' | 'ANDROID';

export const VERIFICATION_PLATFORMS: readonly VerificationPlatform[] = [
  'WEB',
  'IOS',
  'ANDROID',
];

export const isVerificationPlatform = (
  value: unknown,
): value is VerificationPlatform =>
  typeof value === 'string' &&
  (VERIFICATION_PLATFORMS as readonly string[]).includes(value);

/** What a provider needs to mint a session or a replacement token. */
export interface CreateSessionOptions {
  platform: VerificationPlatform;
  levelName?: string;
  locale?: string;
}

/**
 * Who a replacement token is for. Sumsub mints tokens per external user id,
 * so `userId` is always required; providers that key on their own applicant
 * id get it when we already know one.
 */
export interface TokenSubject {
  userId: string;
  providerApplicantId?: string;
}

/** Result of provider.createSession. */
export interface ProviderSession {
  providerApplicantId?: string;
  accessToken: string;
  expiresAt?: string;
}

/** Result of provider.refreshToken. */
export interface ProviderToken {
  accessToken: string;
  expiresAt?: string;
}

/** Inbound webhook headers (framework-neutral shape of Express/Node headers). */
export type WebhookHeaders = Record<string, string | string[] | undefined>;

/**
 * A parsed, provider-agnostic webhook. `status` is null when the event is
 * one we do not act on (the handler ignores it rather than asking the
 * provider to retry). `externalUserId` lets the handler bind the first
 * event to a session created before the provider knew an applicant.
 */
/** What a provider knows about a user before any webhook: the status, and the applicant it filed the user under once one exists. */
export interface UserStatusLookup {
  status: VerificationStatus;
  providerApplicantId?: string;
}

export interface WebhookEvent {
  providerApplicantId: string;
  externalUserId?: string;
  status: VerificationStatus | null;
  rawStatus: string;
  /** The level the event is about, when the provider names one (a user may hold sessions on several). */
  levelName?: string;
  /**
   * The provider's reasons for a `declined` / `finallyRejected` status, in
   * the provider's own vocabulary (Sumsub: `rejectLabels`). Carried through
   * to the audit trail and the host's effects, never interpreted here.
   */
  rejectLabels?: string[];
}

/** Mutation.verificationSessionStart(input:) */
export interface VerificationSessionStartInput {
  platform: VerificationPlatform;
  levelName?: string | null;
  locale?: string | null;
}

/** fetch, late-bound so hosts and tests can inject one (Node 18+ ships fetch). */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
