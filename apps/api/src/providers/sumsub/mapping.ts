// Sumsub -> normalized status mapping.
//
// PHASE 4: this module moves into @blinkbitcoin/kyc-sumsub's root entry
// (`mapSumsubStatus`, `interpretSumsubWebMessage`, ...) so the backend, the
// React Native native-SDK source and the hosted page share one definition.
// When that lands, delete this file and change the two imports in
// ./index.ts to `@blinkbitcoin/kyc-sumsub` (and add the dependency to
// apps/api/package.json). The behaviour must not change: the tests in
// tests/sumsubMapping.test.ts move with it.

import type { VerificationStatus } from '../../types';

export interface SumsubReviewResult {
  reviewAnswer?: 'GREEN' | 'RED';
  reviewRejectType?: 'FINAL' | 'RETRY';
  rejectLabels?: string[];
}

/** Shape of GET /resources/applicants/<id>/status and an applicant's `review`. */
export interface SumsubReviewPayload {
  reviewStatus?: string;
  reviewResult?: SumsubReviewResult;
}

export interface SumsubWebhookPayload extends SumsubReviewPayload {
  type: string;
  applicantId?: string;
  externalUserId?: string;
  levelName?: string;
}

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
 * A RED verdict is FINAL (never retryable -> finallyRejected) or RETRY
 * (the applicant may resubmit -> declined); a missing reject type is
 * treated as retryable, the safer of the two for the applicant.
 */
export const mapSumsubStatus = (
  reviewStatus?: string,
  reviewResult?: SumsubReviewResult
): VerificationStatus => {
  switch (reviewStatus) {
    case 'completed':
      if (reviewResult?.reviewAnswer === 'GREEN') return 'approved';
      if (reviewResult?.reviewAnswer === 'RED') {
        return reviewResult.reviewRejectType === 'FINAL' ? 'finallyRejected' : 'declined';
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

/** Normalize a webhook payload, or null when the event is not actionable. */
export const mapSumsubWebhookStatus = (
  payload: SumsubWebhookPayload
): VerificationStatus | null => {
  if (payload.type === 'applicantReviewed') {
    return mapSumsubStatus(payload.reviewStatus, payload.reviewResult);
  }
  return (
    (SUMSUB_WEBHOOK_TYPES as Record<string, VerificationStatus | undefined>)[payload.type] ?? null
  );
};
