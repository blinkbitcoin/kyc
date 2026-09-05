import type {
  CreateSessionOptions,
  ProviderSession,
  ProviderToken,
  TokenSubject,
  VerificationStatus,
  WebhookEvent,
  WebhookHeaders,
} from '../types';

/**
 * The identity-verification provider seam. Adding a provider = a new module
 * implementing this interface plus a case in src/providers/index.ts; nothing
 * else in the backend changes (Open/Closed).
 */
export interface VerificationProvider {
  /** Start a verification for `userId` and mint the first access token. */
  createSession(userId: string, opts: CreateSessionOptions): Promise<ProviderSession>;

  /** Mint a replacement access token for an existing session. */
  refreshToken(subject: TokenSubject, opts: CreateSessionOptions): Promise<ProviderToken>;

  /** Current normalized status of a known applicant. */
  getStatus(providerApplicantId: string): Promise<VerificationStatus>;

  /** Verify the signature of a raw webhook body. */
  verifyWebhook(headers: WebhookHeaders, rawBody: string, ip?: string): boolean;

  /** Parse a raw webhook body into the normalized event, or null. */
  parseWebhookEvent(rawBody: string): WebhookEvent | null;

  /**
   * OPTIONAL capability (Interface Segregation): look a status up by our own
   * user id, before any webhook has told us the provider's applicant id.
   * Sumsub can (GET /resources/applicants/-;externalUserId=<id>/one); the
   * mock provider cannot, so callers must use `supportsUserStatusLookup`.
   */
  getStatusByUserId?(userId: string): Promise<VerificationStatus>;
}

export const supportsUserStatusLookup = (
  provider: VerificationProvider
): provider is VerificationProvider & Required<Pick<VerificationProvider, 'getStatusByUserId'>> =>
  typeof provider.getStatusByUserId === 'function';
