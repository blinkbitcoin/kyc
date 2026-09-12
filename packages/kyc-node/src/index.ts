// @blinkbitcoin/kyc-node - the server half of identity verification, for
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
export type {
  AccessTokenApp,
  AccessTokenAppCors,
  AccessTokenAppOptions,
  AccessTokenHttpInput,
  HostedPageHandlerOptions,
  HostedPageHttpInput,
  HostedPageHttpResult,
  HttpResult,
  LevelForHook,
  RefreshHttpInput,
  SessionHandlerOptions,
  SessionRefreshHandlerOptions,
  SessionStartHandlerOptions,
  StartHttpInput,
  WebhookHandlerOptions,
  WebhookHttpInput,
} from './handlers';
export {
  createAccessTokenApp,
  createHostedPageHandler,
  createSessionRefreshHandler,
  createSessionStartHandler,
  createWebhookHandler,
  hostedPageHttp,
  mintAccessTokenHttp,
  processWebhookHttp,
  refreshSessionHttp,
  startSessionHttp,
} from './handlers';
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
export type { HostedPageCspOptions, HostedPageParams } from './pages';
export {
  DEFAULT_PERMISSIONS_POLICY,
  hostedPageCsp,
  hostedPageNonce,
  PAGE_STYLE,
  renderNotFoundPage,
} from './pages';
export type { ProductionConfig } from './production';
export {
  assertProductionConfig,
  KYC_ALLOW_DEMO,
  KYC_ENV,
  ProductionConfigError,
  productionErrors,
} from './production';
export type { HostedPageRenderer, VerificationProvider } from './provider';
export { supportsHostedPage, supportsUserStatusLookup } from './provider';
export type {
  MockPageParams,
  MockProviderHandle,
  MockProviderOptions,
  MockWebhookPost,
} from './providers/mock';
export {
  createMockProvider,
  MOCK_APPLICANT_PREFIX,
  MOCK_BUTTON_IDS,
  MOCK_TOKEN_PREFIX,
  MOCK_TOKEN_TTL_SECS,
  MOCK_WEBHOOK_SECRET_DEFAULT,
  MOCK_SIGNATURE_HEADER,
  renderMockPage,
} from './providers/mock';
// Named, not `export *`: an ESM host (tsx, Node) importing this CommonJS
// package only sees names the CJS lexer can find statically
export type {
  Env,
  SignPayloadArgs,
  SumsubAccessToken,
  SumsubApplicant,
  SumsubClient,
  SumsubClientOptions,
  SumsubConfig,
  SumsubConfigKey,
  SumsubProviderHandle,
  SumsubProviderOptions,
  SumsubReviewPayload,
  SumsubReviewResult,
  SumsubWebhookOptions,
  SumsubWebhookPayload,
} from './providers/sumsub';
export {
  ACCESS_TOKEN_SETTINGS,
  assertSumsubConfig,
  buildSumsubStatusTable,
  createSumsubClient,
  createSumsubProvider,
  isSumsubSandboxToken,
  lookupSumsubStatus,
  missingSumsubConfig,
  renderSumsubPage,
  signPayload,
  SUMSUB_CREDENTIALS,
  SUMSUB_DEFAULTS,
  SUMSUB_DIGEST_ALG_HEADER,
  SUMSUB_DIGEST_HEADER,
  SUMSUB_ENV,
  SUMSUB_PERMISSIONS_POLICY,
  SUMSUB_SANDBOX_TOKEN_PREFIX,
  SUMSUB_SDK_URL,
  SUMSUB_STATUS_FALLBACK,
  SUMSUB_STATUS_TABLE,
  SumsubConfigError,
  sumsubConfigFromEnv,
  sumsubDemoSettingsInUse,
  sumsubHostedPage,
  sumsubPageCsp,
  sumsubStatusKey,
} from './providers/sumsub';
export type {
  AccessTokenProviderOptions,
  DefaultRegistryOptions,
  ProviderFromEnvOptions,
  ProviderRegistry,
} from './registry';
export {
  accessTokenProviderFromEnv,
  defaultRegistry,
  KYC_PROVIDER_ENV,
  providerFromEnv,
  providerNameFromEnv,
} from './registry';
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
  StatusTransitionEvent,
  StatusTransitionOutcome,
  VerificationEffects,
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
