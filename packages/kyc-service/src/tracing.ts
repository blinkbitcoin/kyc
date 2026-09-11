// Domain-level tracing helpers on the @opentelemetry/api facade.
//
// The facade is zero-cost: when the SDK (src/instrumentation.ts) has not
// been started, every span here is a no-op - so this module is safe to use
// unconditionally in dev, test, and production code paths.
//
// PII discipline: span attributes carry ids, statuses, and types - never
// applicant names, document data, or images.

import type { Attributes, Span } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { VerificationProvider } from './providers/port';
import type { CreateSessionOptions, TokenSubject } from './types';

const recordFailure = (span: Span, error: unknown): void => {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
};

// Run an async operation inside an active span: records exceptions, sets
// error status, and always ends the span.
export const withSpan = async <T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>
): Promise<T> =>
  trace.getTracer('kyc-api').startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      recordFailure(span, error);
      throw error;
    } finally {
      span.end();
    }
  });

// Synchronous variant (webhook verification / parsing)
export const withSpanSync = <T>(name: string, attributes: Attributes, fn: (span: Span) => T): T =>
  trace.getTracer('kyc-api').startActiveSpan(name, { attributes }, (span) => {
    try {
      return fn(span);
    } catch (error) {
      recordFailure(span, error);
      throw error;
    } finally {
      span.end();
    }
  });

// Attach attributes to whatever span is currently active. No-op when none is.
export const setActiveSpanAttributes = (attributes: Attributes): void => {
  trace.getActiveSpan()?.setAttributes(attributes);
};

/**
 * Wrap a provider so every call is a span.
 *
 * PII discipline: the attributes are the provider name, our own user id,
 * the platform and the resulting status/verification booleans. Provider
 * applicant ids are NOT recorded - they identify a natural person at the
 * provider, and the session id (set on the active span by the resolvers via
 * setActiveSpanAttributes) is enough to correlate.
 */
export const instrumentProvider = (
  provider: VerificationProvider,
  name: string
): VerificationProvider => ({
  // The hosted-page capability is rendering, not a provider call: it rides
  // along untouched so supportsHostedPage() still reflects the adapter
  ...(provider.hostedPage && { hostedPage: provider.hostedPage }),
  ...(provider.getStatusByUserId && {
    getStatusByUserId: (userId: string) =>
      withSpan(
        'kyc.provider.get_status_by_user_id',
        { 'kyc.provider': name, 'enduser.id': userId },
        async (span) => {
          const status = await provider.getStatusByUserId!(userId);
          span.setAttribute('kyc.status', status);
          return status;
        }
      ),
  }),

  createSession: (userId: string, opts: CreateSessionOptions) =>
    withSpan(
      'kyc.provider.create_session',
      { 'kyc.provider': name, 'enduser.id': userId, 'kyc.platform': opts.platform },
      () => provider.createSession(userId, opts)
    ),

  refreshToken: (subject: TokenSubject, opts: CreateSessionOptions) =>
    withSpan(
      'kyc.provider.refresh_token',
      { 'kyc.provider': name, 'enduser.id': subject.userId, 'kyc.platform': opts.platform },
      () => provider.refreshToken(subject, opts)
    ),

  getStatus: (providerApplicantId: string) =>
    withSpan('kyc.provider.get_status', { 'kyc.provider': name }, async (span) => {
      const status = await provider.getStatus(providerApplicantId);
      span.setAttribute('kyc.status', status);
      return status;
    }),

  verifyWebhook: (headers, rawBody, ip) =>
    withSpanSync('kyc.provider.verify_webhook', { 'kyc.provider': name }, (span) => {
      const verified = provider.verifyWebhook(headers, rawBody, ip);
      span.setAttribute('kyc.webhook.verified', verified);
      return verified;
    }),

  parseWebhookEvent: (rawBody) =>
    withSpanSync('kyc.provider.parse_webhook_event', { 'kyc.provider': name }, (span) => {
      const event = provider.parseWebhookEvent(rawBody);
      span.setAttribute('kyc.webhook.malformed', event === null);
      return event;
    }),
});
