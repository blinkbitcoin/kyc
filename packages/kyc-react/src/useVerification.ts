// The headless verification flow for the browser. Owns: connectivity,
// session acquisition, the launch path, the hosted page's message pump and
// the token-refresh effect. Renders nothing - Verification.tsx is the default
// UI over this hook, and a host can write its own.
//
// It is the same hook as the React Native package's, minus the permission
// preflight (browsers prompt for the camera themselves) and with NetInfo
// replaced by navigator.onLine plus the online/offline window events. The
// state machine itself lives in @blinkbitcoin/kyc-core and is shared.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ClientErrorCodes,
  initialMachineState,
  isLaunchable,
  machineReducer,
  planEvent,
  toVerificationError,
  UNKNOWN_ERROR_CODE,
} from '@blinkbitcoin/kyc-core';

import { useTokenRefresh } from './useTokenRefresh';

import type { RefObject } from 'react';
import type {
  LaunchableSource,
  MachineAction,
  MachineState,
  VerificationEffect,
  VerificationError,
  VerificationEvent,
  VerificationResult,
  VerificationSession,
  VerificationSource,
  VerificationSourceError,
  VerificationStatus,
} from '@blinkbitcoin/kyc-core';
import type { TokenPostable } from './useTokenRefresh';

export type { TokenPostable } from './useTokenRefresh';

export interface UseVerificationOptions {
  onComplete: (result: VerificationResult) => void;
  onError: (error: VerificationError) => void;
  onCancel: () => void;
  onStatusChange?: (status: VerificationStatus) => void;
  /** How long the success screen shows before onComplete (default 1500ms). */
  successDelayMs?: number;
}

export interface UseVerification extends MachineState {
  /** Live navigator.onLine, kept current by the online/offline listeners. */
  isOnline: boolean;
  /** Ignored while a run is already in flight. */
  start: () => void;
  /** Re-run the flow from the top (error / permissionDenied / offline). */
  retry: () => void;
  /** Drop the stored session and mint a fresh one (token failures). */
  restart: () => void;
  cancel: () => void;
  /** Feed the hosted page's raw postMessage payload in. */
  handleMessage: (raw: unknown) => void;
  /** Feed an already-normalized event in (mounted SDK, frame load errors). */
  handleEvent: (event: VerificationEvent) => void;
  /** Attach to the iframe so token refreshes can be posted into it. */
  iframeRef: RefObject<TokenPostable | null>;
}

export const DEFAULT_SUCCESS_DELAY_MS = 1500;

export const useVerification = (
  source: VerificationSource,
  options: UseVerificationOptions,
): UseVerification => {
  const [state, dispatch] = useReducer(machineReducer, initialMachineState);
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);

  // Mirrors `state` through the same reducer, so async work reads the current
  // machine without re-subscribing. Never assigned during render.
  const stateRef = useRef<MachineState>(initialMachineState);
  // Callbacks and the source live in refs: identity changes never re-run
  // anything, and no effect depends on them.
  const handlersRef = useRef(options);
  const sourceRef = useRef(source);
  const mountedRef = useRef(true);
  // True from the moment begin() is called until it settles, so a second
  // start() cannot mint a second session over the first.
  const runningRef = useRef(false);
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<TokenPostable | null>(null);

  useEffect(() => {
    handlersRef.current = options;
    sourceRef.current = source;
  });

  // A delayed onComplete belongs to the run that scheduled it: a new run, a
  // cancel or an unmount must retire it, or it fires over the new state.
  const clearCompleteTimeout = useCallback(() => {
    if (completeTimeoutRef.current) {
      clearTimeout(completeTimeoutRef.current);
      completeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearCompleteTimeout();
    };
  }, [clearCompleteTimeout]);

  const applyAction = useCallback((action: MachineAction) => {
    stateRef.current = machineReducer(stateRef.current, action);
    dispatch(action);
  }, []);

  // Losing the connection while the page is on screen is the browser's
  // equivalent of NetInfo reporting unreachable: park on the offline screen
  // instead of leaving a dead iframe up. Coming back online never resumes by
  // itself - the user presses Retry, which re-checks and re-starts.
  useEffect(() => {
    const goOnline = (): void => {
      setIsOnline(true);
    };
    const goOffline = (): void => {
      setIsOnline(false);
      const { status } = stateRef.current;
      // 'pending' counts as on screen: the page is still mounted behind the
      // outcome overlay and can still be sent a late decision or a token
      // refresh, neither of which can arrive without a connection.
      if (
        status === 'loading' ||
        status === 'verifying' ||
        status === 'pending'
      ) {
        applyAction({ type: 'offline' });
      }
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [applyAction]);

  const failWith = useCallback(
    (error: VerificationError, keepSession: boolean) => {
      applyAction({ type: 'failed', error, keepSession });
      // A throwing host callback must not surface twice (once here, once as
      // an unhandled rejection out of begin()) - it already got the error.
      try {
        handlersRef.current.onError(error);
      } catch {
        // Swallowed: the state already reflects the failure.
      }
    },
    [applyAction],
  );

  const refreshToken = useTokenRefresh(source, {
    getSession: () => stateRef.current.session,
    target: iframeRef,
    // A token failure keeps the session so the error screen can offer Restart.
    onFailure: error => failWith(error, true),
  });

  const runEffect = useCallback(
    (effect: VerificationEffect) => {
      switch (effect.type) {
        case 'statusChange':
          handlersRef.current.onStatusChange?.(effect.status);
          break;
        case 'complete': {
          const { result } = effect;
          if (!effect.delayed) {
            handlersRef.current.onComplete(result);
            break;
          }
          const delay =
            handlersRef.current.successDelayMs ?? DEFAULT_SUCCESS_DELAY_MS;
          completeTimeoutRef.current = setTimeout(() => {
            completeTimeoutRef.current = null;
            if (mountedRef.current) {
              handlersRef.current.onComplete(result);
            }
          }, delay);
          break;
        }
        case 'cancel':
          handlersRef.current.onCancel();
          break;
        case 'error':
          // A throwing host callback must not surface twice (once here, once
          // as an unhandled rejection) - it already got the error, same as
          // failWith above.
          try {
            handlersRef.current.onError(effect.error);
          } catch {
            // Swallowed: the state already reflects the failure.
          }
          break;
        case 'refreshToken':
          refreshToken();
          break;
      }
    },
    [refreshToken],
  );

  const handleEvent = useCallback(
    (event: VerificationEvent) => {
      if (!mountedRef.current) {
        return;
      }
      // There is no permission preflight on the web - the browser prompts for
      // the camera itself, and the page tells us when the user refused. Like
      // offline, that is a recoverable state with its own screen, not an
      // onError failure, so it is intercepted before the shared planner.
      // The reason is always 'denied': a browser cannot tell us the camera is
      // blocked at the OS level, and there is nothing the library could do
      // about it if it could - so the screen always offers Try again.
      if (
        event.type === 'error' &&
        event.code === ClientErrorCodes.PERMISSION_DENIED
      ) {
        applyAction({ type: 'permission', reason: 'denied' });
        return;
      }
      const plan = planEvent(event, stateRef.current.session);
      if (plan.action) {
        applyAction(plan.action);
      }
      if (plan.effect) {
        runEffect(plan.effect);
      }
    },
    [applyAction, runEffect],
  );

  const handleMessage = useCallback(
    (raw: unknown) => {
      const event = sourceRef.current.interpret(raw);
      if (!event) {
        return;
      }
      handleEvent(event);
    },
    [handleEvent],
  );

  const runLaunch = useCallback(
    async (launchable: LaunchableSource, acquired: VerificationSession) => {
      try {
        const result = await launchable.launch(acquired, handleEvent);
        if (!mountedRef.current) {
          return;
        }
        const current = stateRef.current;
        // A cancel (idle), a failure (error) or a complete event already
        // settled the flow - the resolved status is advisory, not a second
        // outcome.
        if (
          current.result !== null ||
          current.status === 'idle' ||
          current.status === 'error'
        ) {
          return;
        }
        handleEvent(
          result.applicantId
            ? {
                type: 'complete',
                status: result.status,
                applicantId: result.applicantId,
              }
            : { type: 'complete', status: result.status },
        );
      } catch (cause) {
        if (!mountedRef.current) {
          return;
        }
        const current = stateRef.current;
        // Mirrors the resolve path's guard: a cancel (idle), a failure
        // (error) or a complete event already settled the flow via the
        // emitted event before the promise rejected - the rejection is the
        // same failure surfacing a second way, not a new one, and the
        // event's error (fired first) wins over the rejection's.
        if (
          current.result !== null ||
          current.status === 'idle' ||
          current.status === 'error'
        ) {
          return;
        }
        const sourceError = cause as VerificationSourceError | undefined;
        failWith(
          toVerificationError(
            sourceError?.code ?? UNKNOWN_ERROR_CODE,
            sourceError?.message,
          ),
          false,
        );
      }
    },
    [failWith, handleEvent],
  );

  // Never rejects, and therefore never needs a `void` at its call sites: the
  // only awaited calls are source.start() and runLaunch(), each inside its
  // own try/catch, and navigator.onLine cannot throw. Unlike the React Native
  // hook there is no host callback (checkPermissions) awaited outside a
  // guard, so an extra outer wrapper here would be an unreachable branch
  // under the 100% threshold - the guarantee comes from the structure.
  const begin = useCallback(async () => {
    runningRef.current = true;
    clearCompleteTimeout();
    try {
      applyAction({ type: 'begin' });

      // Check connectivity BEFORE any request: offline is an expected state,
      // not an error, so onError is not called for it.
      if (!navigator.onLine) {
        applyAction({ type: 'offline' });
        return;
      }

      let acquired: VerificationSession;
      try {
        acquired = await sourceRef.current.start();
      } catch (cause) {
        if (!mountedRef.current) {
          return;
        }
        const sourceError = cause as VerificationSourceError | undefined;
        failWith(
          toVerificationError(
            sourceError?.code ?? UNKNOWN_ERROR_CODE,
            sourceError?.message,
          ),
          false,
        );
        return;
      }
      if (!mountedRef.current) {
        return;
      }
      applyAction({ type: 'session', session: acquired });

      const current = sourceRef.current;
      if (isLaunchable(current)) {
        await runLaunch(current, acquired);
      }
    } finally {
      runningRef.current = false;
    }
  }, [applyAction, clearCompleteTimeout, failWith, runLaunch]);

  const start = useCallback(() => {
    if (runningRef.current) {
      return;
    }
    // Safe to leave floating: begin() never rejects (see above).
    begin();
  }, [begin]);

  const retry = useCallback(() => {
    if (runningRef.current) {
      return;
    }
    // Safe to leave floating: begin() never rejects (see above).
    begin();
  }, [begin]);

  const restart = useCallback(() => {
    if (runningRef.current) {
      return;
    }
    applyAction({ type: 'clearSession' });
    // Safe to leave floating: begin() never rejects (see above).
    begin();
  }, [applyAction, begin]);

  const cancel = useCallback(() => {
    clearCompleteTimeout();
    applyAction({ type: 'cancelled' });
    runEffect({ type: 'cancel' });
  }, [applyAction, clearCompleteTimeout, runEffect]);

  return {
    ...state,
    isOnline,
    start,
    retry,
    restart,
    cancel,
    handleMessage,
    handleEvent,
    iframeRef,
  };
};
