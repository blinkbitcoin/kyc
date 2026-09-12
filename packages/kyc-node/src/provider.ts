// The identity-verification provider PORT (hexagonal architecture). Adapters
// implement it (providers/sumsub/provider.ts, providers/mock/provider.ts);
// the verification service and any HTTP layer depend only on this port, so
// nothing provider-specific leaks past it.

import type { HostedPageParams } from './pages';
import type {
  CreateSessionOptions,
  ProviderSession,
  ProviderToken,
  TokenSubject,
  UserStatusLookup,
  VerificationStatus,
  WebhookEvent,
  WebhookHeaders,
} from './types';

/**
 * A provider that serves a hosted verification page (its web SDK wrapped in
 * the kyc-bridge protocol). The page is the provider's: what it embeds, the
 * CSP it needs and the device permissions it asks for all belong here, so
 * the generic page layer never names a provider.
 */
export interface HostedPageRenderer {
  /** The page for one session, under the nonce the host generated. */
  render(params: HostedPageParams): string;
  /** The Content-Security-Policy the page needs; the host's default when absent. */
  csp?(nonce: string): string;
  /** The Permissions-Policy the page needs; the host's default when absent. */
  permissionsPolicy?: string;
}

export interface VerificationProvider {
  /** Start a verification for `userId` and mint the first access token. */
  createSession(
    userId: string,
    opts: CreateSessionOptions,
  ): Promise<ProviderSession>;

  /** Mint a replacement access token for an existing session. */
  refreshToken(
    subject: TokenSubject,
    opts: CreateSessionOptions,
  ): Promise<ProviderToken>;

  /** Current normalized status of a known applicant. */
  getStatus(providerApplicantId: string): Promise<VerificationStatus>;

  /** Verify the signature of a raw webhook body. */
  verifyWebhook(headers: WebhookHeaders, rawBody: string, ip?: string): boolean;

  /** Parse a raw webhook body into the normalized event, or null. */
  parseWebhookEvent(rawBody: string): WebhookEvent | null;

  /**
   * OPTIONAL capability (Interface Segregation): look a user up by our own
   * user id, before any webhook has told us the provider's applicant id -
   * the status, and the applicant id itself once the provider has one, so
   * the session can be bound without waiting for a webhook. Sumsub can
   * (GET /resources/applicants/-;externalUserId=<id>/one); the mock provider
   * cannot, so callers must use `supportsUserStatusLookup`.
   */
  getStatusByUserId?(userId: string): Promise<UserStatusLookup>;

  /**
   * OPTIONAL capability: the hosted verification page (mode 2). A provider
   * whose only client is the native SDK omits it; callers gate on
   * `supportsHostedPage`.
   */
  hostedPage?: HostedPageRenderer;
}

export const supportsUserStatusLookup = (
  provider: VerificationProvider,
): provider is VerificationProvider &
  Required<Pick<VerificationProvider, 'getStatusByUserId'>> =>
  typeof provider.getStatusByUserId === 'function';

export const supportsHostedPage = (
  provider: VerificationProvider,
): provider is VerificationProvider &
  Required<Pick<VerificationProvider, 'hostedPage'>> =>
  typeof provider.hostedPage?.render === 'function';
