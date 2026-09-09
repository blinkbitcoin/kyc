// @blinkbitcoin/kyc-server - the server half of identity verification, for
// Node: the verification-session domain over the provider and store ports,
// the hosted verification page, and the primitives every adapter shares.
// Framework-free: the Express router is ./express, the Knex store ./knex,
// the Sumsub adapter ./sumsub.

export type { AuditAction, AuditEntry, AuditMetadata } from './audit';
export { ALLOWED_METADATA_KEYS, sanitizeAuditMetadata } from './audit';
export { bearerToken } from './auth';
export {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SCRIPT,
  BRIDGE_SOURCE,
} from './bridge/script';
export type { ErrorCode } from './errors';
export type { GraphQLContext, KycGraphQLOptions } from './graphql';
export { createKycGraphQL, typeDefs } from './graphql';
export {
  createError,
  ErrorCodes,
  Errors,
  getErrorCode,
  KycError,
} from './errors';
export { escapeHtml, jsonForScript, sanitizeId } from './html';
export type { RetryConfig } from './http';
export {
  HttpError,
  isClientError,
  isNetworkError,
  isNotFoundError,
  RETRY_CONFIG,
  shouldRetry,
  sleep,
  withRetry,
} from './http';
export type { Logger } from './log';
export { consoleLogger, sanitizeForLog } from './log';
export type { HostedPageParams } from './pages';
export {
  DEFAULT_PERMISSIONS_POLICY,
  hostedPageCsp,
  hostedPageNonce,
  PAGE_STYLE,
  renderNotFoundPage,
} from './pages';
export type { HostedPageRenderer, VerificationProvider } from './provider';
export { supportsHostedPage, supportsUserStatusLookup } from './provider';
export type { HexDigestAlgorithm, VerifyHexDigestArgs } from './signature';
export {
  DEFAULT_DIGEST_ALGORITHM,
  DIGEST_ALGORITHMS,
  hmacHex,
  timingSafeEqualString,
  verifyHexDigest,
} from './signature';
export type {
  ApplyStatusTransitionOptions,
  HostedPageDecision,
  RefreshResult,
  SessionView,
  StartResult,
  StatusSource,
  StatusTransition,
  StatusTransitionOutcome,
  VerificationService,
  VerificationServiceDeps,
  WebhookOutcome,
} from './sessions';
export { createVerificationService, publicOrigin } from './sessions';
export type {
  NewAuditEntry,
  NewSession,
  SessionRecord,
  SessionStore,
  StatusWrite,
  StatusWriteOutcome,
} from './store';
export { createMemorySessionStore } from './store';
export type { SpanAttributes, SpanLike, Tracing } from './tracing';
export { noopTracing } from './tracing';
export type {
  CreateSessionOptions,
  FetchLike,
  ProviderSession,
  ProviderToken,
  TokenSubject,
  VerificationPlatform,
  VerificationSessionStartInput,
  VerificationStatus,
  WebhookEvent,
  WebhookHeaders,
} from './types';
export {
  isVerificationPlatform,
  isVerificationStatus,
  TERMINAL_STATUSES,
  VERIFICATION_PLATFORMS,
  VERIFICATION_STATUSES,
} from './types';
export type { ValidatedStartInput } from './validation';
export {
  LOCALE_PATTERN,
  MAX_LEVEL_NAME_LENGTH,
  MAX_LOCALE_LENGTH,
  optionalText,
  requireId,
  validateStartInput,
} from './validation';
