// The headless verification flow. Owns: camera-permission preflight,
// connectivity, session acquisition, the native-SDK launch path, and the
// hosted page's message pump. Renders nothing - Verification.tsx is the
// default UI over this hook, and a host can write its own.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  initialMachineState,
  isLaunchable,
  machineReducer,
  planEvent,
  toVerificationError,
  UNKNOWN_ERROR_CODE,
} from '@blinkbitcoin/kyc-core/hosted';
import { useTokenRefresh } from './useTokenRefresh';

import type { MutableRefObject } from 'react';
import type {
  LaunchableSource,
  MachineAction,
  MachineState,
  PermissionReason,
  VerificationEffect,
  VerificationError,
  VerificationEvent,
  VerificationResult,
  VerificationSession,
  VerificationSource,
  VerificationSourceError,
  VerificationStatus,
} from '@blinkbitcoin/kyc-core/hosted';
import type { TokenInjectable } from './useTokenRefresh';

/** What a host permission library reports back. */
export type PermissionState = 'granted' | PermissionReason;

/** Host seam: preflight the camera with whatever library the app already uses. */
export type CheckPermissions = () => Promise<PermissionState>;

export type { TokenInjectable } from './useTokenRefresh';

export interface UseVerificationOptions {
  onComplete: (result: VerificationResult) => void;
  onError: (error: VerificationError) => void;
  onCancel: () => void;
  onStatusChange?: (status: VerificationStatus) => void;
  /** Omit to let the WebView / native SDK prompt for the camera itself. */
  checkPermissions?: CheckPermissions;
  /** How long the success screen shows before onComplete (default 1500ms). */
  successDelayMs?: number;
}

export interface UseVerification extends MachineState {
  /** Ignored while a run is already in flight. */
  start: () => void;
  /** Re-run the flow from the top (error / permissionDenied / offline). */
  retry: () => void;
  /** Drop the stored session and mint a fresh one (token failures). */
  restart: () => void;
  cancel: () => void;
  /** Feed the WebView's raw onMessage payload in. */
  handleMessage: (raw: unknown) => void;
  /** Feed an already-normalized event in (native SDK, WebView load errors). */
  handleEvent: (event: VerificationEvent) => void;
  /** Attach to the WebView so token refreshes can be injected. */
  webViewRef: MutableRefObject<TokenInjectable | null>;
}

export const DEFAULT_SUCCESS_DELAY_MS = 1500;

const isOnline = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable !== false;
};

export const useVerification = (
  source: VerificationSource,
  options: UseVerificationOptions,
): UseVerification => {
  const [state, dispatch] = useReducer(machineReducer, initialMachineState);

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
  const webViewRef = useRef<TokenInjectable | null>(null);

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

  const failWith = useCallback(
    (error: VerificationError, keepSession: boolean) => {
      applyAction({ type: 'failed', error, keepSession });
      handlersRef.current.onError(error);
    },
    [applyAction],
  );

  const refreshToken = useTokenRefresh(source, {
    getSession: () => stateRef.current.session,
    target: webViewRef,
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
          handlersRef.current.onError(effect.error);
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

  // Never rejects: a host callback that throws (checkPermissions, a source
  // that throws synchronously) becomes the error state, not an unhandled
  // rejection in the app's console. That is why the call sites can be bare.
  const begin = useCallback(async () => {
    runningRef.current = true;
    clearCompleteTimeout();
    try {
      applyAction({ type: 'begin' });

      const check = handlersRef.current.checkPermissions;
      if (check) {
        const permission = await check();
        if (!mountedRef.current) {
          return;
        }
        if (permission !== 'granted') {
          // Not an error: a distinct state with its own Retry / Settings copy.
          applyAction({ type: 'permission', reason: permission });
          return;
        }
      }

      const online = await isOnline();
      if (!mountedRef.current) {
        return;
      }
      if (!online) {
        // Not an error either - expected, and recoverable with retry().
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
    } catch (cause) {
      if (!mountedRef.current) {
        return;
      }
      const thrown = cause as VerificationError | undefined;
      failWith(toVerificationError(UNKNOWN_ERROR_CODE, thrown?.message), false);
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
    // Safe to leave floating: begin() never rejects (see above).
    begin();
  }, [begin]);

  const restart = useCallback(() => {
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
    start,
    retry,
    restart,
    cancel,
    handleMessage,
    handleEvent,
    webViewRef,
  };
};
