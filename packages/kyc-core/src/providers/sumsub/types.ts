// The Sumsub vocabulary this package translates, in one place. Pure types
// plus their runtime companions - no imports, so every entry (root,
// ./react-native, ./web) and packages/kyc-service can read them.

/** `reviewStatus` as the REST API, the webhooks and the web SDK report it. */
export type SumsubReviewStatus =
  | 'init'
  | 'pending'
  | 'prechecked'
  | 'queued'
  | 'completed'
  | 'onHold';

export const SUMSUB_REVIEW_STATUSES: readonly SumsubReviewStatus[] = [
  'init',
  'pending',
  'prechecked',
  'queued',
  'completed',
  'onHold',
] as const;

/** The verdict on a completed review. */
export type SumsubReviewAnswer = 'GREEN' | 'RED';

export const SUMSUB_REVIEW_ANSWERS: readonly SumsubReviewAnswer[] = [
  'GREEN',
  'RED',
] as const;

/** FINAL is terminal; RETRY lets the applicant resubmit. */
export type SumsubRejectType = 'FINAL' | 'RETRY';

export const SUMSUB_REJECT_TYPES: readonly SumsubRejectType[] = [
  'FINAL',
  'RETRY',
] as const;

export interface SumsubReviewResult {
  reviewAnswer?: SumsubReviewAnswer;
  reviewRejectType?: SumsubRejectType;
  rejectLabels?: string[];
}

/** Shape of GET /resources/applicants/<id>/status and an applicant's `review`. */
export interface SumsubReviewPayload {
  reviewStatus?: string;
  reviewResult?: SumsubReviewResult;
}

/** Body of POST /webhook/kyc/sumsub. */
export interface SumsubWebhookPayload extends SumsubReviewPayload {
  type: string;
  applicantId?: string;
  externalUserId?: string;
  levelName?: string;
}

/** `status` on the Mobile SDK's launch result. */
export type SNSMobileSDKStatus =
  | 'Ready'
  | 'Failed'
  | 'Initial'
  | 'Incomplete'
  | 'Pending'
  | 'TemporarilyDeclined'
  | 'FinallyRejected'
  | 'Approved'
  | 'ActionCompleted';

/** `errorType` on the Mobile SDK's launch result. */
export type SNSMobileSDKErrorType =
  | 'Unknown'
  | 'InvalidParameters'
  | 'Unauthorized'
  | 'InitialLoadingFailed'
  | 'ApplicantNotFound'
  | 'ApplicantMisconfigured'
  | 'NetworkError'
  | 'UnexpectedError'
  | 'InterruptedError';

/** What `SNSMobileSDK…build().launch()` resolves with. */
export interface SNSMobileSDKResult {
  success: boolean;
  status: SNSMobileSDKStatus;
  errorType?: SNSMobileSDKErrorType;
  errorMsg?: string;
  actionResult?: unknown;
}
