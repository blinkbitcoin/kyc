// Backend domain vocabulary. Deliberately hand-written rather than imported
// from @blinkbitcoin/kyc-core: apps/api does not depend on the packages, so
// the SDL (src/typeDefs.ts) is the shared contract and tests/types.test.ts
// pins these values to it.

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

export const isVerificationStatus = (value: unknown): value is VerificationStatus =>
  typeof value === 'string' && (VERIFICATION_STATUSES as readonly string[]).includes(value);

/**
 * Statuses a session can never leave. `declined` is deliberately NOT here:
 * Sumsub's RETRY rejection lets an applicant resubmit, so declined may move
 * back to pending and on to approved.
 */
export const TERMINAL_STATUSES: ReadonlySet<VerificationStatus> = new Set<VerificationStatus>([
  'approved',
  'finallyRejected',
]);

/** Where the verification runs - selects the provider token flavour. */
export type VerificationPlatform = 'WEB' | 'IOS' | 'ANDROID';

export const VERIFICATION_PLATFORMS: readonly VerificationPlatform[] = ['WEB', 'IOS', 'ANDROID'];

export const isVerificationPlatform = (value: unknown): value is VerificationPlatform =>
  typeof value === 'string' && (VERIFICATION_PLATFORMS as readonly string[]).includes(value);

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

export type WebhookHeaders = Record<string, string | string[] | undefined>;

/**
 * A parsed, provider-agnostic webhook. `status` is null when the event is
 * one we do not act on (the handler ignores it rather than asking the
 * provider to retry). `externalUserId` lets the handler bind the first
 * event to a session created before the provider knew an applicant.
 */
export interface WebhookEvent {
  providerApplicantId: string;
  externalUserId?: string;
  status: VerificationStatus | null;
  rawStatus: string;
}

/** Mutation.verificationSessionStart(input:) */
export interface VerificationSessionStartInput {
  platform: VerificationPlatform;
  levelName?: string | null;
  locale?: string | null;
}

export interface GraphQLContext {
  userId: string | null;
}
