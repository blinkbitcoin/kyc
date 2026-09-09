// Sumsub <-> normalized vocabulary: the single source of truth for Sumsub
// semantics. The backend (webhook + hosted page), the React Native native
// source and any host mounting the web SDK itself all read this module
// through @blinkbitcoin/kyc-core/sumsub, so a rule is written once. Pure
// TypeScript: no DOM, no React Native, no @sumsub import - and nothing from
// the package root (the ./sumsub entry stays Apollo-free, guard-tested).

import { ClientErrorCodes } from '../../errors';

import type {
  VerificationEvent,
  VerificationStatus,
} from '../../verification/types';

import type {
  SNSMobileSDKErrorType,
  SNSMobileSDKResult,
  SNSMobileSDKStatus,
  SumsubReviewResult,
  SumsubWebhookPayload,
} from './types';

/** Namespaced fallback for a provider error that carries no code of its own. */
export const SUMSUB_ERROR_CODE = 'SUMSUB_ERROR';

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

// --- Mobile SDK (@sumsub/react-native-mobilesdk-module) ---------------------

/**
 * The Mobile SDK's own status vocabulary. `Failed` and `ActionCompleted`
 * carry no applicant meaning (the first is an error, the second belongs to
 * the action flow this version does not use), so they map to null and the
 * caller turns them into an error event.
 */
const MOBILE_STATUSES: Record<SNSMobileSDKStatus, VerificationStatus | null> = {
  Ready: 'initial',
  Initial: 'initial',
  Incomplete: 'incomplete',
  Pending: 'pending',
  TemporarilyDeclined: 'declined',
  FinallyRejected: 'finallyRejected',
  Approved: 'approved',
  Failed: null,
  ActionCompleted: null,
};

/** Normalize a Mobile SDK status (result status or onStatusChanged event). */
export const mapSumsubMobileStatus = (
  status: string,
): VerificationStatus | null =>
  MOBILE_STATUSES[status as SNSMobileSDKStatus] ?? null;

/**
 * Two Sumsub error types have a normalized client meaning the UI acts on
 * (an expired token is refreshable, a network failure is retryable);
 * everything else keeps its provider identity under a SUMSUB_ prefix.
 */
const MOBILE_ERROR_CODES: Partial<Record<SNSMobileSDKErrorType, string>> = {
  Unauthorized: ClientErrorCodes.TOKEN_EXPIRED,
  NetworkError: ClientErrorCodes.NETWORK_ERROR,
};

export const mapSumsubMobileErrorCode = (result: SNSMobileSDKResult): string =>
  result.errorType
    ? (MOBILE_ERROR_CODES[result.errorType] ??
      `SUMSUB_${result.errorType.toUpperCase()}`)
    : `SUMSUB_${result.status.toUpperCase()}`;

/** Turn the launch result into the one event that terminates the flow. */
export const mapSumsubMobileResult = (
  result: SNSMobileSDKResult,
): VerificationEvent => {
  const status = result.success ? mapSumsubMobileStatus(result.status) : null;
  if (status) {
    return { type: 'complete', status };
  }
  const message = result.errorMsg;
  return {
    type: 'error',
    code: mapSumsubMobileErrorCode(result),
    ...(message ? { message } : {}),
  };
};

// --- Web SDK (@sumsub/websdk) message vocabulary ----------------------------

export const SUMSUB_EVENT_NAMES = [
  'idCheck.onApplicantLoaded',
  'idCheck.onApplicantSubmitted',
  'idCheck.onApplicantResubmitted',
  'idCheck.onApplicantStatusChanged',
  'idCheck.onError',
] as const;

export type SumsubEventName = (typeof SUMSUB_EVENT_NAMES)[number];

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * Translate one `snsWebSdk` message into a normalized event, or null when it
 * is not part of this version's vocabulary. Payloads come from a provider
 * iframe, so every field is read defensively.
 */
export const interpretSumsubWebMessage = (
  type: string,
  payload: unknown,
): VerificationEvent | null => {
  const data = asRecord(payload);

  switch (type) {
    case 'idCheck.onApplicantLoaded': {
      const applicantId = asString(data.applicantId);
      return applicantId ? { type: 'applicantLoaded', applicantId } : null;
    }
    case 'idCheck.onApplicantSubmitted':
    case 'idCheck.onApplicantResubmitted':
      return { type: 'submitted' };
    case 'idCheck.onApplicantStatusChanged':
      return {
        type: 'statusChanged',
        status: mapSumsubStatus(
          asString(data.reviewStatus),
          data.reviewResult as SumsubReviewResult | undefined,
        ),
      };
    case 'idCheck.onError': {
      const message = asString(data.reason);
      return {
        type: 'error',
        code: asString(data.code) ?? SUMSUB_ERROR_CODE,
        ...(message ? { message } : {}),
      };
    }
    default:
      return null;
  }
};
