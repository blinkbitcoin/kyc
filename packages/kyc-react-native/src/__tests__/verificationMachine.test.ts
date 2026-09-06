import {
  ClientErrorCodes,
  getErrorMessage,
} from '@blinkbitcoin/kyc-core/hosted';

import {
  describeOutcome,
  initialMachineState,
  isRestartableError,
  machineReducer,
  planEvent,
  toVerificationError,
  UNKNOWN_ERROR_CODE,
} from '../verificationMachine';

import type { VerificationSession } from '@blinkbitcoin/kyc-core/hosted';
import type { MachineState } from '../verificationMachine';

const session: VerificationSession = {
  provider: 'mock',
  sessionId: 'sess-1',
  url: 'https://kyc.example.com/hosted/sess-1',
  allowedOrigin: 'https://kyc.example.com',
};

const verifying: MachineState = {
  ...initialMachineState,
  status: 'verifying',
  session,
};

describe('toVerificationError', () => {
  it('always carries a human message for a known code', () => {
    expect(toVerificationError(ClientErrorCodes.PERMISSION_DENIED)).toEqual({
      code: 'PERMISSION_DENIED',
      message: getErrorMessage(ClientErrorCodes.PERMISSION_DENIED),
    });
  });

  it('prefers a server message when the code is unknown', () => {
    expect(toVerificationError(UNKNOWN_ERROR_CODE, 'boom')).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'boom',
    });
  });
});

describe('machineReducer', () => {
  it('starts idle with nothing acquired', () => {
    expect(initialMachineState).toEqual({
      status: 'idle',
      session: null,
      result: null,
      error: null,
    });
  });

  it('clears the previous error and result when a run begins', () => {
    const failed = machineReducer(initialMachineState, {
      type: 'failed',
      error: toVerificationError(UNKNOWN_ERROR_CODE),
      keepSession: false,
    });
    expect(machineReducer(failed, { type: 'begin' })).toEqual({
      status: 'loading',
      session: null,
      result: null,
      error: null,
    });
  });

  it('parks on permissionDenied and offline without touching the session', () => {
    expect(machineReducer(verifying, { type: 'permissionDenied' }).status).toBe(
      'permissionDenied',
    );
    expect(machineReducer(verifying, { type: 'offline' }).status).toBe(
      'offline',
    );
    expect(machineReducer(verifying, { type: 'offline' }).session).toBe(
      session,
    );
  });

  it('enters verifying when the session resolves', () => {
    expect(
      machineReducer(initialMachineState, { type: 'session', session }),
    ).toEqual({ status: 'verifying', session, result: null, error: null });
  });

  it('records the applicant id on the running session', () => {
    expect(
      machineReducer(verifying, { type: 'applicant', applicantId: 'app-9' })
        .session,
    ).toEqual({ ...session, applicantId: 'app-9' });
  });

  it('ignores an applicant id when no session is running', () => {
    expect(
      machineReducer(initialMachineState, {
        type: 'applicant',
        applicantId: 'app-9',
      }),
    ).toEqual(initialMachineState);
  });

  it('moves to pending while review runs', () => {
    expect(machineReducer(verifying, { type: 'awaitReview' }).status).toBe(
      'pending',
    );
  });

  it('lands on success only for an approved outcome', () => {
    const approved = machineReducer(verifying, {
      type: 'outcome',
      result: { status: 'approved', applicantId: 'app-9' },
    });
    expect(approved.status).toBe('success');
    expect(approved.result).toEqual({
      status: 'approved',
      applicantId: 'app-9',
    });
  });

  it('renders every other terminal outcome on the pending screen', () => {
    for (const status of [
      'declined',
      'finallyRejected',
      'incomplete',
      'pending',
    ] as const) {
      const next = machineReducer(verifying, {
        type: 'outcome',
        result: { status },
      });
      expect(next.status).toBe('pending');
      expect(next.result).toEqual({ status });
    }
  });

  it('resets everything on cancel', () => {
    expect(machineReducer(verifying, { type: 'cancelled' })).toEqual(
      initialMachineState,
    );
  });

  it('keeps the session on a restartable failure and drops it otherwise', () => {
    const error = toVerificationError(ClientErrorCodes.TOKEN_EXPIRED);
    expect(
      machineReducer(verifying, { type: 'failed', error, keepSession: true }),
    ).toEqual({
      status: 'error',
      session,
      result: null,
      error,
    });
    expect(
      machineReducer(verifying, { type: 'failed', error, keepSession: false })
        .session,
    ).toBeNull();
  });

  it('drops the session on clearSession without leaving the state', () => {
    expect(machineReducer(verifying, { type: 'clearSession' })).toEqual({
      ...verifying,
      session: null,
    });
  });
});

describe('planEvent', () => {
  it('stores the applicant id with no host callback', () => {
    expect(
      planEvent({ type: 'applicantLoaded', applicantId: 'app-9' }, session),
    ).toEqual({
      action: { type: 'applicant', applicantId: 'app-9' },
      effect: null,
    });
  });

  it('treats submitted as "review running"', () => {
    expect(planEvent({ type: 'submitted' }, session)).toEqual({
      action: { type: 'awaitReview' },
      effect: { type: 'statusChange', status: 'pending' },
    });
  });

  it('only parks on pending for a pending status change', () => {
    expect(
      planEvent({ type: 'statusChanged', status: 'pending' }, session).action,
    ).toEqual({
      type: 'awaitReview',
    });
    const other = planEvent(
      { type: 'statusChanged', status: 'incomplete' },
      session,
    );
    expect(other.action).toBeNull();
    expect(other.effect).toEqual({
      type: 'statusChange',
      status: 'incomplete',
    });
  });

  it('prefers the event applicant id, then the session one, then neither', () => {
    expect(
      planEvent(
        { type: 'complete', status: 'approved', applicantId: 'from-event' },
        session,
      ).action,
    ).toEqual({
      type: 'outcome',
      result: { status: 'approved', applicantId: 'from-event' },
    });
    expect(
      planEvent(
        { type: 'complete', status: 'approved' },
        {
          ...session,
          applicantId: 'from-session',
        },
      ).action,
    ).toEqual({
      type: 'outcome',
      result: { status: 'approved', applicantId: 'from-session' },
    });
    expect(
      planEvent({ type: 'complete', status: 'declined' }, null).action,
    ).toEqual({
      type: 'outcome',
      result: { status: 'declined' },
    });
  });

  it('delays onComplete only for an approval', () => {
    expect(
      planEvent({ type: 'complete', status: 'approved' }, null).effect,
    ).toEqual({
      type: 'complete',
      result: { status: 'approved' },
      delayed: true,
    });
    expect(
      planEvent({ type: 'complete', status: 'pending' }, null).effect,
    ).toEqual({
      type: 'complete',
      result: { status: 'pending' },
      delayed: false,
    });
  });

  it('maps cancel to a reset plus the host callback', () => {
    expect(planEvent({ type: 'cancel' }, session)).toEqual({
      action: { type: 'cancelled' },
      effect: { type: 'cancel' },
    });
  });

  it('asks for a token refresh and changes no state', () => {
    expect(planEvent({ type: 'tokenExpired' }, session)).toEqual({
      action: null,
      effect: { type: 'refreshToken' },
    });
  });

  it('turns sessionExpired into a restartable TOKEN_EXPIRED error', () => {
    const plan = planEvent({ type: 'sessionExpired' }, session);
    const error = toVerificationError(ClientErrorCodes.TOKEN_EXPIRED);
    expect(plan.action).toEqual({ type: 'failed', error, keepSession: true });
    expect(plan.effect).toEqual({ type: 'error', error });
  });

  it('carries a page error code and message through', () => {
    const plan = planEvent(
      { type: 'error', code: 'PROVIDER_UNAVAILABLE' },
      session,
    );
    expect(plan.action).toEqual({
      type: 'failed',
      error: toVerificationError('PROVIDER_UNAVAILABLE'),
      keepSession: false,
    });
    expect(
      planEvent({ type: 'error', code: 'ODD', message: 'odd thing' }, session)
        .effect,
    ).toEqual({ type: 'error', error: { code: 'ODD', message: 'odd thing' } });
  });
});

describe('outcome copy and restart affordance', () => {
  it('describes every terminal status', () => {
    expect(describeOutcome('approved')).toMatch(/verified/i);
    expect(describeOutcome('declined')).toMatch(/try again/i);
    expect(describeOutcome('finallyRejected')).toMatch(
      /could not be verified/i,
    );
    expect(describeOutcome('incomplete')).toMatch(/incomplete/i);
    expect(describeOutcome('pending')).toMatch(/reviewing/i);
    expect(describeOutcome()).toMatch(/reviewing/i);
  });

  it('offers Restart only for the two token failures', () => {
    expect(isRestartableError(ClientErrorCodes.TOKEN_EXPIRED)).toBe(true);
    expect(isRestartableError(ClientErrorCodes.TOKEN_REFRESH_FAILED)).toBe(
      true,
    );
    expect(isRestartableError(ClientErrorCodes.NETWORK_ERROR)).toBe(false);
  });
});
