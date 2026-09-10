// The Sumsub adapter, complete: configuration, the REST client (app-token
// signing, the three endpoints), the provider over the port, and the hosted
// page. Peer-free; reaches kyc-core only through its Apollo-free /sumsub entry.

export type {
  SumsubReviewPayload,
  SumsubReviewResult,
  SumsubWebhookPayload,
} from '@blinkbitcoin/kyc-core/sumsub';
export type {
  SignPayloadArgs,
  SumsubAccessToken,
  SumsubApplicant,
  SumsubClient,
  SumsubClientOptions,
} from './client';
export { createSumsubClient, signPayload } from './client';
export type { Env, SumsubConfig, SumsubConfigKey } from './config';
export {
  assertSumsubConfig,
  missingSumsubConfig,
  SUMSUB_CREDENTIALS,
  SUMSUB_DEFAULTS,
  SUMSUB_ENV,
  SumsubConfigError,
  sumsubConfigFromEnv,
} from './config';
export {
  buildSumsubStatusTable,
  lookupSumsubStatus,
  renderSumsubPage,
  SUMSUB_PERMISSIONS_POLICY,
  SUMSUB_SDK_URL,
  SUMSUB_STATUS_FALLBACK,
  SUMSUB_STATUS_TABLE,
  sumsubHostedPage,
  sumsubPageCsp,
  sumsubStatusKey,
} from './page';
export type {
  SumsubProviderHandle,
  SumsubProviderOptions,
  SumsubWebhookOptions,
} from './provider';
export {
  createSumsubProvider,
  SUMSUB_DIGEST_ALG_HEADER,
  SUMSUB_DIGEST_HEADER,
} from './provider';
