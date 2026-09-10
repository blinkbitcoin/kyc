// Copy of the default Verification UI, resolved once for both platforms:
// the platform's defaults, then `label` for the idle title and the start
// button, then the host's overrides (null / undefined keep the default).
// Blink is multilingual, so every string the component renders is a key
// here; the platforms add the keys only they render.
//
// Apollo-free: part of the ./hosted entry.

import { describeOutcome } from './machine';

import type { VerificationError } from './machine';
import type { VerificationStatus } from './types';

/** Copy overrides for the default Verification UI (a platform may add keys). */
export interface VerificationLabels {
  /** Idle-screen title (defaults to `label`). */
  title?: string;
  /** Idle-screen subtitle. */
  subtitle?: string;
  /** Start button (defaults to `label`). */
  start?: string;
  cancel?: string;
  /** Loading screen. */
  loading?: string;
  /** Placeholder while a native SDK runs in front of the component. */
  inProgressTitle?: string;
  inProgressSubtitle?: string;
  /** Title over the outcome copy while the review runs. */
  pendingTitle?: string;
  permissionTitle?: string;
  permissionMessage?: string;
  retry?: string;
  restart?: string;
  offlineTitle?: string;
  offlineMessage?: string;
  checkConnection?: string;
  errorTitle?: string;
  /** Pending-screen and success-screen copy, one key per outcome. */
  outcomeApproved?: string;
  outcomeDeclined?: string;
  outcomeFinallyRejected?: string;
  outcomeIncomplete?: string;
  /** No decision yet ('initial', 'pending' or no result at all). */
  outcomeReviewing?: string;
  /**
   * Error-screen copy by error code, over the built-in getErrorMessage
   * text the error carries (docs/integration/error-codes.md lists them).
   */
  errorMessages?: Partial<Record<string, string>>;
}

/** The defaults a platform supplies: every label but the two `label` fills. */
export type LabelDefaults<L extends VerificationLabels> = Required<
  Omit<L, 'title' | 'start' | 'errorMessages'>
>;

/** Every label present, plus the (possibly empty) error-copy table. */
export type ResolvedLabels<L extends VerificationLabels> = Required<
  Omit<L, 'errorMessages'>
> & { errorMessages: Readonly<Record<string, string>> };

/** The outcome copy the built-in screens use unless the host overrides it. */
export const DEFAULT_OUTCOME_LABELS = {
  outcomeApproved: describeOutcome('approved'),
  outcomeDeclined: describeOutcome('declined'),
  outcomeFinallyRejected: describeOutcome('finallyRejected'),
  outcomeIncomplete: describeOutcome('incomplete'),
  outcomeReviewing: describeOutcome(undefined),
} as const;

export const resolveLabelsWith = <L extends VerificationLabels>(
  defaults: LabelDefaults<L>,
  label: string,
  labels?: L,
): ResolvedLabels<L> => {
  const { errorMessages, ...flat } = labels ?? {};
  const resolved = {
    ...defaults,
    title: label,
    start: label,
    errorMessages: {},
  } as ResolvedLabels<L>;
  for (const key of Object.keys(flat) as (keyof typeof flat)[]) {
    const value = flat[key];
    if (value != null) {
      (resolved as Record<string, unknown>)[key] = value;
    }
  }
  const table: Record<string, string> = {};
  for (const [code, text] of Object.entries(errorMessages ?? {})) {
    if (text != null) {
      table[code] = text;
    }
  }
  resolved.errorMessages = table;
  return resolved;
};

type OutcomeLabels = Pick<
  ResolvedLabels<VerificationLabels>,
  | 'outcomeApproved'
  | 'outcomeDeclined'
  | 'outcomeFinallyRejected'
  | 'outcomeIncomplete'
  | 'outcomeReviewing'
>;

/** The copy for a result's status; anything undecided reads as reviewing. */
export const outcomeLabel = (
  labels: OutcomeLabels,
  status?: VerificationStatus,
): string => {
  switch (status) {
    case 'approved':
      return labels.outcomeApproved;
    case 'declined':
      return labels.outcomeDeclined;
    case 'finallyRejected':
      return labels.outcomeFinallyRejected;
    case 'incomplete':
      return labels.outcomeIncomplete;
    default:
      return labels.outcomeReviewing;
  }
};

/** The host's copy for the error's code, else the message the error carries. */
export const failureLabel = (
  labels: Pick<ResolvedLabels<VerificationLabels>, 'errorMessages'>,
  failure: VerificationError,
): string => labels.errorMessages[failure.code] ?? failure.message;
