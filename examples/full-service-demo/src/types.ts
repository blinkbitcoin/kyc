// Shared types for the service. The domain vocabulary (statuses, platforms,
// provider results, webhook events) is the package's; only the GraphQL
// context is the service's own.

export type {
  CreateSessionOptions,
  ProviderSession,
  ProviderToken,
  SessionRecord,
  TokenSubject,
  VerificationPlatform,
  VerificationProvider,
  VerificationSessionStartInput,
  VerificationStatus,
  WebhookEvent,
  WebhookHeaders,
} from '@blinkbitcoin/kyc-server';
export { TERMINAL_STATUSES, VERIFICATION_STATUSES } from '@blinkbitcoin/kyc-server';

export interface GraphQLContext {
  userId: string | null;
}
