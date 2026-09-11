// The mock adapter: an in-memory provider with its own signed webhooks and
// hosted page, for dev and every E2E suite.

export type { MockPageParams, MockWebhookPost } from './page';
export { MOCK_BUTTON_IDS, renderMockPage } from './page';
export type { MockProviderHandle, MockProviderOptions } from './provider';
export {
  createMockProvider,
  MOCK_APPLICANT_PREFIX,
  MOCK_SIGNATURE_HEADER,
  MOCK_TOKEN_PREFIX,
  MOCK_TOKEN_TTL_SECS,
  MOCK_WEBHOOK_SECRET_DEFAULT,
} from './provider';
