// The verification state machine as two pure functions, shared by every
// platform package.
//
// machineReducer is a plain (state, action) => state reducer. planEvent turns
// a normalized VerificationEvent into (a) the state action it implies and
// (b) a *description* of the host callback it implies. The platform hook
// executes the effects; nothing here imports React, React Native, the DOM or
// Apollo, so the whole flow is unit-testable as data and both the React and
// the React Native packages behave identically.

import { ClientErrorCodes } from '../errors';
import { getErrorMessage } from './messages';

import type {
  VerificationEvent,
  IdentityVerificationResult,
  VerificationSession,
  IdentityVerificationStatus,
} from './types';

/** What the UI is showing. The spec's eight states, no more. */
export type VerificationState =
  | 'idle'
  | 'loading'
  | 'verifying'
  | 'pending'
  | 'success'
  | 'permissionDenied'
  | 'error'
  | 'offline';

/** Why the camera preflight refused: recoverable by retrying, or not. */
export type PermissionReason = 'denied' | 'blocked';

/** An error with copy already resolved - what onError receives. */
export interface IdentityVerificationError {
  code: string;
  message: string;
}

export interface MachineState {
  status: VerificationState;
  /** The running session; kept across a restartable failure. */
  session: VerificationSession | null;
  /** The terminal outcome, once one arrived. */
  result: IdentityVerificationResult | null;
  error: IdentityVerificationError | null;
  /**
   * Set with status 'permissionDenied'. 'denied' can be retried in place;
   * 'blocked' cannot - only the OS settings can change it.
   */
  permissionReason: PermissionReason | null;
}

export type MachineAction =
  | { type: 'begin' }
  | { type: 'permission'; reason: PermissionReason }
  | { type: 'offline' }
  | { type: 'session'; session: VerificationSession }
  | { type: 'applicant'; applicantId: string }
  | { type: 'awaitReview' }
  | { type: 'outcome'; result: IdentityVerificationResult }
  | { type: 'cancelled' }
  | { type: 'failed'; error: IdentityVerificationError; keepSession: boolean }
  | { type: 'clearSession' };

/** A host callback the hook must run, described rather than performed. */
export type VerificationEffect =
  | { type: 'statusChange'; status: IdentityVerificationStatus }
  | { type: 'complete'; result: IdentityVerificationResult; delayed: boolean }
  | { type: 'cancel' }
  | { type: 'error'; error: IdentityVerificationError }
  | { type: 'refreshToken' };

export interface VerificationPlan {
  action: MachineAction | null;
  effect: VerificationEffect | null;
}

/** Fallback when a rejection carries no code of its own. */
export const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR';

export const initialMachineState: MachineState = {
  status: 'idle',
  session: null,
  result: null,
  error: null,
  permissionReason: null,
};

/** Attach the user-facing copy once, at the edge. */
export const toIdentityVerificationError = (
  code: string,
  message?: string,
): IdentityVerificationError => ({
  code,
  message: getErrorMessage(code, message),
});

/**
 * The failure the error screen renders. The machine only ever enters 'error'
 * together with an error, but MachineState cannot express that, so this is
 * the one place the invariant is stated - explicitly, instead of a cast that
 * would hand the UI `undefined.message` if it ever broke.
 */
export const describeFailure = (
  error: IdentityVerificationError | null,
): IdentityVerificationError =>
  error ?? toIdentityVerificationError(UNKNOWN_ERROR_CODE);

export const machineReducer = (
  state: MachineState,
  action: MachineAction,
): MachineState => {
  switch (action.type) {
    case 'begin':
      return {
        ...state,
        status: 'loading',
        result: null,
        error: null,
        permissionReason: null,
      };
    case 'permission':
      return {
        ...state,
        status: 'permissionDenied',
        permissionReason: action.reason,
      };
    case 'offline':
      return { ...state, status: 'offline' };
    case 'session':
      return {
        status: 'verifying',
        session: action.session,
        result: null,
        error: null,
        permissionReason: null,
      };
    case 'applicant':
      return state.session
        ? {
            ...state,
            session: { ...state.session, applicantId: action.applicantId },
          }
        : state;
    case 'awaitReview':
      return { ...state, status: 'pending' };
    case 'outcome':
      return {
        ...state,
        status: action.result.status === 'approved' ? 'success' : 'pending',
        result: action.result,
        error: null,
      };
    case 'cancelled':
      return initialMachineState;
    case 'failed':
      return {
        status: 'error',
        session: action.keepSession ? state.session : null,
        result: null,
        error: action.error,
        permissionReason: null,
      };
    case 'clearSession':
      return { ...state, session: null };
  }
};

export const planEvent = (
  event: VerificationEvent,
  session: VerificationSession | null,
): VerificationPlan => {
  switch (event.type) {
    case 'applicantLoaded':
      return {
        action: { type: 'applicant', applicantId: event.applicantId },
        effect: null,
      };
    case 'submitted':
      return {
        action: { type: 'awaitReview' },
        effect: { type: 'statusChange', status: 'pending' },
      };
    case 'statusChanged':
      return {
        action: event.status === 'pending' ? { type: 'awaitReview' } : null,
        effect: { type: 'statusChange', status: event.status },
      };
    case 'complete': {
      const applicantId = event.applicantId ?? session?.applicantId;
      const result: IdentityVerificationResult = applicantId
        ? { status: event.status, applicantId }
        : { status: event.status };
      return {
        action: { type: 'outcome', result },
        effect: {
          type: 'complete',
          result,
          delayed: event.status === 'approved',
        },
      };
    }
    case 'cancel':
      return { action: { type: 'cancelled' }, effect: { type: 'cancel' } };
    case 'tokenExpired':
      // The hook decides whether the source can refresh; state is unchanged.
      return { action: null, effect: { type: 'refreshToken' } };
    case 'sessionExpired': {
      // There is no SESSION_EXPIRED client code - TOKEN_EXPIRED is the one
      // the copy and the Restart affordance are written for.
      const error = toIdentityVerificationError(ClientErrorCodes.TOKEN_EXPIRED);
      return {
        action: { type: 'failed', error, keepSession: true },
        effect: { type: 'error', error },
      };
    }
    case 'error': {
      const error = toIdentityVerificationError(event.code, event.message);
      return {
        action: { type: 'failed', error, keepSession: false },
        effect: { type: 'error', error },
      };
    }
  }
};

/** Copy for the outcome screen; `undefined` means "submitted, review running". */
export const describeOutcome = (
  status?: IdentityVerificationStatus,
): string => {
  switch (status) {
    case 'approved':
      return 'Your identity has been verified.';
    case 'declined':
      return 'We could not verify your identity. You can try again with clearer documents.';
    case 'finallyRejected':
      return 'Your identity could not be verified.';
    case 'incomplete':
      return 'Your verification is incomplete.';
    default:
      return 'Thanks - we are reviewing your documents. This usually takes a few minutes.';
  }
};

/** Only a token failure can be recovered by minting a fresh session. */
export const isRestartableError = (code: string): boolean =>
  code === ClientErrorCodes.TOKEN_EXPIRED ||
  code === ClientErrorCodes.TOKEN_REFRESH_FAILED;
