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
