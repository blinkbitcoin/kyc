// Sumsub <-> normalized vocabulary: the single source of truth for Sumsub
// semantics. apps/api (webhook + hosted page), the ./react-native source and
// any host mounting the web SDK itself all read this module, so a rule is
// written once. Pure TypeScript: no DOM, no React Native, no @sumsub import.

import type { VerificationStatus } from '@blinkbitcoin/kyc-core/hosted';

import type { SumsubReviewResult, SumsubWebhookPayload } from './types';

/** Webhook types we act on; anything else is acknowledged and ignored. */
export const SUMSUB_WEBHOOK_TYPES = {
  applicantCreated: 'incomplete',
  applicantPending: 'pending',
  applicantOnHold: 'pending',
  applicantReset: 'initial',
} as const satisfies Record<string, VerificationStatus>;

/**
 * Normalize a Sumsub review. `reviewStatus` is the lifecycle stage and
 * `reviewResult` the verdict; only a `completed` review carries a verdict.
 * A RED verdict is FINAL (never retryable -> finallyRejected) or RETRY (the
 * applicant may resubmit -> declined); a missing reject type is treated as
 * retryable, the safer of the two for the applicant.
 */
export const mapSumsubStatus = (
  reviewStatus?: string,
  reviewResult?: SumsubReviewResult,
): VerificationStatus => {
  switch (reviewStatus) {
    case 'completed':
      if (reviewResult?.reviewAnswer === 'GREEN') return 'approved';
      if (reviewResult?.reviewAnswer === 'RED') {
        return reviewResult.reviewRejectType === 'FINAL'
          ? 'finallyRejected'
          : 'declined';
      }
      return 'pending';
    case 'pending':
    case 'queued':
    case 'prechecked':
    case 'onHold':
      return 'pending';
    case 'init':
      return 'incomplete';
    default:
      return 'initial';
  }
};

/** Normalize a webhook by its `type`, or null when it is not actionable. */
export const mapSumsubWebhookType = (
  type: string,
  reviewStatus?: string,
  reviewResult?: SumsubReviewResult,
): VerificationStatus | null => {
  if (type === 'applicantReviewed') {
    return mapSumsubStatus(reviewStatus, reviewResult);
  }
  return (
    (SUMSUB_WEBHOOK_TYPES as Record<string, VerificationStatus | undefined>)[
      type
    ] ?? null
  );
};

/** Payload-shaped convenience wrapper over mapSumsubWebhookType. */
export const mapSumsubWebhookStatus = (
  payload: SumsubWebhookPayload,
): VerificationStatus | null =>
  mapSumsubWebhookType(
    payload.type,
    payload.reviewStatus,
    payload.reviewResult,
  );
