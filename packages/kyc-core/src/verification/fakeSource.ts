// A UI-free LaunchableSource for demos and E2E: no provider SDK, no network,
// no React. Either script the outcome (`outcome`) or drive it from the host's
// own buttons through `controller` (`outcome: 'manual'`).
//
// Apollo-free and DOM-free: shipped from the ./testing entry.

import { ClientErrorCodes } from '../errors';
import { interpretBridgeMessage } from './bridge';

import type {
  LaunchableSource,
  VerificationEvent,
  VerificationResult,
  VerificationSession,
  VerificationSourceError,
  VerificationStatus,
} from './types';

export type FakeOutcome =
  | 'approved'
  | 'declined'
  | 'cancel'
  | 'error'
  /** Settle only when the host calls a controller method. */
  | 'manual';

/** Drive a running launch() from a demo screen's buttons. */
export interface FakeLaunchController {
  approve(): void;
  decline(): void;
  cancel(): void;
  fail(code: string, message?: string): void;
}

export interface FakeLaunchableSource extends LaunchableSource {
  readonly controller: FakeLaunchController;
}

export interface FakeLaunchableSourceOptions {
  /** Default 'approved'. */
  outcome?: FakeOutcome;
  /** Delay before a scripted outcome settles. Default 0 (same tick). */
  delayMs?: number;
  /** Default 'fake-applicant'. */
  applicantId?: string;
  /** Default 'fake'. */
  provider?: string;
}

/**
 * A cancelled applicant is left incomplete; the cancel event is the signal,
 * and this resolved status is advisory only (see `LaunchableSource.launch`).
 */
const CANCEL_STATUS: VerificationStatus = 'incomplete';

export const createFakeLaunchableSource = (
  options: FakeLaunchableSourceOptions = {},
): FakeLaunchableSource => {
  const applicantId = options.applicantId ?? 'fake-applicant';
  const provider = options.provider ?? 'fake';
  const outcome = options.outcome ?? 'approved';
  const delayMs = options.delayMs ?? 0;

  let resolveLaunch: ((result: VerificationResult) => void) | null = null;
  let rejectLaunch: ((error: VerificationSourceError) => void) | null = null;
  // Assigned by launch() before any code path that might read it - the
  // functions below only ever run after that assignment (see takeResolve).
  let emit!: (event: VerificationEvent) => void;

  const takeResolve = (): ((result: VerificationResult) => void) | null => {
    const pending = resolveLaunch;
    resolveLaunch = null;
    rejectLaunch = null;
    return pending;
  };

  const finish = (status: VerificationStatus): void => {
    const pending = takeResolve();
    if (!pending) {
      return;
    }
    emit({ type: 'statusChanged', status });
    emit({ type: 'complete', status, applicantId });
    pending({ status, applicantId });
  };

  const cancel = (): void => {
    const pending = takeResolve();
    if (!pending) {
      return;
    }
    emit({ type: 'cancel' });
    pending({ status: CANCEL_STATUS, applicantId });
  };

  const fail = (code: string, message?: string): void => {
    const pending = rejectLaunch;
    resolveLaunch = null;
    rejectLaunch = null;
    if (!pending) {
      return;
    }
    emit({ type: 'error', code, message });
    pending({ code, message });
  };

  const controller: FakeLaunchController = {
    approve: () => finish('approved'),
    decline: () => finish('declined'),
    cancel,
    fail,
  };

  const runScript = (): void => {
    switch (outcome) {
      case 'approved':
        finish('approved');
        break;
      case 'declined':
        finish('declined');
        break;
      case 'cancel':
        cancel();
        break;
      case 'error':
        fail(ClientErrorCodes.SDK_UNAVAILABLE, 'scripted fake failure');
        break;
      default:
        // 'manual': the host settles it through `controller`.
        break;
    }
  };

  return {
    controller,

    async start(): Promise<VerificationSession> {
      return {
        provider,
        sessionId: 'fake-session',
        accessToken: 'fake-access-token',
        applicantId,
      };
    },

    launch(_session, onEvent) {
      if (resolveLaunch) {
        return Promise.reject({
          code: ClientErrorCodes.SDK_UNAVAILABLE,
          message: 'launch already in progress',
        } as VerificationSourceError);
      }

      return new Promise<VerificationResult>((resolve, reject) => {
        emit = onEvent;
        resolveLaunch = resolve;
        rejectLaunch = reject;

        emit({ type: 'applicantLoaded', applicantId });
        emit({ type: 'submitted' });

        if (delayMs > 0) {
          setTimeout(runScript, delayMs);
        } else {
          runScript();
        }
      });
    },

    interpret: interpretBridgeMessage,
  };
};
