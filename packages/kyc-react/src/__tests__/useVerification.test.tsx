import { act, renderHook } from '@testing-library/react';
import { ClientErrorCodes } from '@blinkbitcoin/kyc-core';

import { useVerification } from '../useVerification';

import type {
  VerificationEvent,
  VerificationSession,
  VerificationSource,
} from '@blinkbitcoin/kyc-core';
import type { UseVerificationOptions } from '../useVerification';

const ORIGIN = 'https://kyc.example.com';

const session: VerificationSession = {
  provider: 'mock',
  sessionId: 'sess-1',
  url: `${ORIGIN}/hosted/sess-1`,
  allowedOrigin: ORIGIN,
};

const hostedSource = (
  overrides: Partial<VerificationSource> = {},
): VerificationSource => ({
  start: jest.fn(async () => session),
  interpret: jest.fn(
    (raw: unknown) => (raw as { event?: VerificationEvent }).event ?? null,
  ),
  ...overrides,
});

const handlers = (
  over: Partial<UseVerificationOptions> = {},
): UseVerificationOptions => ({
  onComplete: jest.fn(),
  onError: jest.fn(),
  onCancel: jest.fn(),
  onStatusChange: jest.fn(),
  ...over,
});

const setNavigatorOnline = (value: boolean): void => {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
};

const mount = (source: VerificationSource, options: UseVerificationOptions) =>
  renderHook(() => useVerification(source, options));

const messageOf = (event: VerificationEvent) => ({ event });

beforeEach(() => {
  setNavigatorOnline(true);
  jest.clearAllMocks();
});

describe('useVerification - acquiring a session', () => {
  it('starts idle and reaches verifying through loading', async () => {
    const source = hostedSource();
    const options = handlers();
    const view = mount(source, options);
    expect(view.result.current.status).toBe('idle');
    expect(view.result.current.isOnline).toBe(true);

    await act(async () => {
      view.result.current.start();
    });

    expect(source.start).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('verifying');
    expect(view.result.current.session).toEqual(session);
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('maps a rejecting start() to an error state and onError', async () => {
    const source = hostedSource({
      start: jest.fn(async () => {
        throw { code: 'SESSION_CREATION_FAILED', message: 'nope' };
      }),
    });
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.status).toBe('error');
    expect(view.result.current.error?.code).toBe('SESSION_CREATION_FAILED');
    expect(options.onError).toHaveBeenCalledWith(view.result.current.error);
  });

  it('falls back to UNKNOWN_ERROR when the rejection carries no code', async () => {
    const source = hostedSource({
      start: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    const view = mount(source, handlers());

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.error).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'boom',
    });
  });

  it('ignores a second start() while the first is still in flight', async () => {
    let resolveStart!: (value: VerificationSession) => void;
    const source = hostedSource({
      start: jest.fn(
        () =>
          new Promise<VerificationSession>(resolve => {
            resolveStart = resolve;
          }),
      ),
    });
    const view = mount(source, handlers());

    await act(async () => {
      view.result.current.start();
      view.result.current.start();
    });
    expect(source.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart(session);
    });
    expect(view.result.current.status).toBe('verifying');

    // Once the run has settled, start() works again.
    await act(async () => {
      view.result.current.start();
    });
    expect(source.start).toHaveBeenCalledTimes(2);
  });

  it('ignores a second retry() while the first is still in flight', async () => {
    let resolveStart!: (value: VerificationSession) => void;
    const source = hostedSource({
      start: jest.fn(
        () =>
          new Promise<VerificationSession>(resolve => {
            resolveStart = resolve;
          }),
      ),
    });
    const view = mount(source, handlers());

    await act(async () => {
      view.result.current.retry();
      view.result.current.retry();
    });
    expect(source.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart(session);
    });
    expect(view.result.current.status).toBe('verifying');
  });

  it('ignores a second restart() while the first is still in flight', async () => {
    let resolveStart!: (value: VerificationSession) => void;
    const source = hostedSource({
      start: jest.fn(
        () =>
          new Promise<VerificationSession>(resolve => {
            resolveStart = resolve;
          }),
      ),
    });
    const view = mount(source, handlers());

    await act(async () => {
      view.result.current.restart();
      view.result.current.restart();
    });
    expect(source.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart(session);
    });
    expect(view.result.current.status).toBe('verifying');
  });
});

describe('useVerification - connectivity', () => {
  it('parks on offline before calling start(), without onError', async () => {
    setNavigatorOnline(false);
    const source = hostedSource();
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.status).toBe('offline');
    expect(source.start).not.toHaveBeenCalled();
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('retry() re-checks the connection and recovers when back online', async () => {
    setNavigatorOnline(false);
    const source = hostedSource();
    const view = mount(source, handlers());

    await act(async () => {
      view.result.current.start();
    });
    expect(view.result.current.status).toBe('offline');
    expect(source.start).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    await act(async () => {
      view.result.current.retry();
    });
    expect(view.result.current.status).toBe('verifying');
    expect(source.start).toHaveBeenCalledTimes(1);
  });

  it('drops to offline when the browser goes offline mid-flow, and back on online', async () => {
    const view = mount(hostedSource(), handlers());
    await act(async () => {
      view.result.current.start();
    });
    expect(view.result.current.status).toBe('verifying');

    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(view.result.current.status).toBe('offline');
    expect(view.result.current.isOnline).toBe(false);

    act(() => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    // Coming back online never resumes by itself - the user presses Retry.
    expect(view.result.current.status).toBe('offline');
    expect(view.result.current.isOnline).toBe(true);
  });

  it('drops to offline when the browser goes offline while the outcome is pending', async () => {
    const options = handlers();
    const view = mount(hostedSource(), options);
    await act(async () => {
      view.result.current.start();
    });
    act(() => {
      view.result.current.handleMessage(messageOf({ type: 'submitted' }));
    });
    expect(view.result.current.status).toBe('pending');

    // The page is still mounted behind the outcome screen, so a lost
    // connection is as fatal there as it is while it is showing - but it is
    // still an expected, recoverable state, not an onError failure.
    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(view.result.current.status).toBe('offline');
    expect(view.result.current.isOnline).toBe(false);
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('ignores an offline event when nothing is running', () => {
    const view = mount(hostedSource(), handlers());

    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(view.result.current.status).toBe('idle');
    expect(view.result.current.isOnline).toBe(false);
  });
});

describe('useVerification - the launchable path', () => {
  it('launches instead of embedding a page and completes', async () => {
    jest.useFakeTimers();
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: async (
        _s: VerificationSession,
        onEvent: (event: VerificationEvent) => void,
      ) => {
        onEvent({ type: 'statusChanged', status: 'approved' });
        return { status: 'approved' as const, applicantId: 'app-1' };
      },
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.status).toBe('success');
    expect(options.onStatusChange).toHaveBeenCalledWith('approved');
    expect(options.onComplete).not.toHaveBeenCalled();

    await act(async () => {
      jest.runAllTimers();
    });
    expect(options.onComplete).toHaveBeenCalledWith({
      status: 'approved',
      applicantId: 'app-1',
    });
    jest.useRealTimers();
  });

  it('treats a cancel event during launch as an abort', async () => {
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: async (
        _s: VerificationSession,
        onEvent: (event: VerificationEvent) => void,
      ) => {
        onEvent({ type: 'cancel' });
        return { status: 'incomplete' as const };
      },
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.status).toBe('idle');
    expect(view.result.current.session).toBeNull();
    expect(options.onCancel).toHaveBeenCalledTimes(1);
    expect(options.onComplete).not.toHaveBeenCalled();
  });

  it('synthesizes the terminal complete when launch resolves silently', async () => {
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: async () => ({
        status: 'incomplete' as const,
        applicantId: 'app-7',
      }),
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.status).toBe('pending');
    expect(options.onComplete).toHaveBeenCalledWith({
      status: 'incomplete',
      applicantId: 'app-7',
    });
  });

  it('synthesizes a complete with no applicant id when none is reported', async () => {
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: async () => ({ status: 'declined' as const }),
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(options.onComplete).toHaveBeenCalledWith({ status: 'declined' });
  });

  it('maps a rejecting launch() to an error state', async () => {
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: async () => {
        throw { code: ClientErrorCodes.SDK_UNAVAILABLE };
      },
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.status).toBe('error');
    expect(view.result.current.error?.code).toBe(
      ClientErrorCodes.SDK_UNAVAILABLE,
    );
    expect(options.onError).toHaveBeenCalledWith(view.result.current.error);
  });

  it('falls back to UNKNOWN_ERROR when a rejecting launch carries no code', async () => {
    const source: VerificationSource = {
      start: async () => ({ provider: 'silent' }),
      interpret: () => null,
      launch: async () => {
        throw new Error('boom');
      },
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.error).toEqual({
      code: 'UNKNOWN_ERROR',
      message: 'boom',
    });
  });

  it('reports onError exactly once when the launch both emits error and rejects', async () => {
    // The real contract for a launch failure: the SDK reports the error
    // through onEvent and then rejects the promise. onError must fire once,
    // not once per signal, and the event's error wins over the rejection's.
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: async (
        _s: VerificationSession,
        onEvent: (event: VerificationEvent) => void,
      ) => {
        onEvent({ type: 'error', code: 'PROVIDER_UNAVAILABLE' });
        throw { code: ClientErrorCodes.SDK_UNAVAILABLE, message: 'torn down' };
      },
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.status).toBe('error');
    expect(view.result.current.error?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(options.onError).toHaveBeenCalledTimes(1);
  });

  it('treats a cancel event followed by a launch rejection as an abort, not an error', async () => {
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: async (
        _s: VerificationSession,
        onEvent: (event: VerificationEvent) => void,
      ) => {
        onEvent({ type: 'cancel' });
        throw {
          code: ClientErrorCodes.SDK_UNAVAILABLE,
          message: 'torn down after cancel',
        };
      },
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.status).toBe('idle');
    expect(options.onCancel).toHaveBeenCalledTimes(1);
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('does not overwrite an error the launch already reported', async () => {
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: async (
        _s: VerificationSession,
        onEvent: (event: VerificationEvent) => void,
      ) => {
        onEvent({ type: 'error', code: 'PROVIDER_UNAVAILABLE' });
        return { status: 'incomplete' as const };
      },
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });

    expect(view.result.current.error?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(options.onComplete).not.toHaveBeenCalled();
  });
});

describe('useVerification - a host callback that throws', () => {
  // The package has no Node types (it is a browser library), so the runner's
  // process is reached through globalThis with just the two methods this
  // assertion needs.
  interface RejectionReporter {
    on: (event: 'unhandledRejection', listener: () => void) => void;
    off: (event: 'unhandledRejection', listener: () => void) => void;
  }
  const runner = (globalThis as unknown as { process: RejectionReporter })
    .process;

  it('calls onError exactly once and does not reject begin() when onError itself throws', async () => {
    const onError = jest.fn(() => {
      throw new Error('host onError exploded');
    });
    const options = handlers({ onError });
    const source = hostedSource({
      start: jest.fn(async () => {
        throw { code: 'SESSION_CREATION_FAILED', message: 'nope' };
      }),
    });
    const view = mount(source, options);

    const unhandled = jest.fn();
    runner.on('unhandledRejection', unhandled);
    try {
      await act(async () => {
        view.result.current.start();
      });
    } finally {
      runner.off('unhandledRejection', unhandled);
    }

    expect(view.result.current.status).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('does not throw out of handleMessage when onError itself throws on a bridge error event', async () => {
    const onError = jest.fn(() => {
      throw new Error('host onError exploded');
    });
    const options = handlers({ onError });
    const view = mount(hostedSource(), options);
    await act(async () => {
      view.result.current.start();
    });

    act(() => {
      view.result.current.handleMessage(
        messageOf({ type: 'error', code: ClientErrorCodes.NETWORK_ERROR }),
      );
    });

    expect(view.result.current.status).toBe('error');
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('useVerification - bridge messages', () => {
  const started = async (options: UseVerificationOptions) => {
    const source = hostedSource();
    const view = mount(source, options);
    await act(async () => {
      view.result.current.start();
    });
    return { source, view };
  };

  it('ignores a message the source does not recognise', async () => {
    const options = handlers();
    const { view } = await started(options);

    act(() => {
      view.result.current.handleMessage({ nothing: true });
    });

    expect(view.result.current.status).toBe('verifying');
    expect(options.onStatusChange).not.toHaveBeenCalled();
  });

  it('records the applicant id, then the submission, then the outcome', async () => {
    const options = handlers();
    const { view } = await started(options);

    act(() => {
      view.result.current.handleMessage(
        messageOf({ type: 'applicantLoaded', applicantId: 'app-3' }),
      );
    });
    expect(view.result.current.session?.applicantId).toBe('app-3');

    act(() => {
      view.result.current.handleMessage(messageOf({ type: 'submitted' }));
    });
    expect(view.result.current.status).toBe('pending');
    expect(options.onStatusChange).toHaveBeenCalledWith('pending');

    act(() => {
      view.result.current.handleMessage(
        messageOf({ type: 'complete', status: 'pending' }),
      );
    });
    expect(options.onComplete).toHaveBeenCalledWith({
      status: 'pending',
      applicantId: 'app-3',
    });
  });

  it('reports a page error and clears the session', async () => {
    const options = handlers();
    const { view } = await started(options);

    act(() => {
      view.result.current.handleMessage(
        messageOf({ type: 'error', code: ClientErrorCodes.NETWORK_ERROR }),
      );
    });

    expect(view.result.current.status).toBe('error');
    expect(view.result.current.session).toBeNull();
    expect(options.onError).toHaveBeenCalledWith(view.result.current.error);
  });

  it('parks on permissionDenied for the page camera refusal, without onError', async () => {
    const options = handlers();
    const { view } = await started(options);

    act(() => {
      view.result.current.handleMessage(
        messageOf({ type: 'error', code: ClientErrorCodes.PERMISSION_DENIED }),
      );
    });

    expect(view.result.current.status).toBe('permissionDenied');
    // The browser can only report "the user refused", never "blocked in OS
    // settings", so the web hook always carries the retryable reason.
    expect(view.result.current.permissionReason).toBe('denied');
    expect(view.result.current.session).toEqual(session);
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('cancel() resets and calls back', async () => {
    const options = handlers();
    const { view } = await started(options);

    act(() => {
      view.result.current.cancel();
    });

    expect(view.result.current.status).toBe('idle');
    expect(options.onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the session for restart on sessionExpired and mints a new one', async () => {
    const options = handlers();
    const { source, view } = await started(options);

    act(() => {
      view.result.current.handleMessage(messageOf({ type: 'sessionExpired' }));
    });
    expect(view.result.current.status).toBe('error');
    expect(view.result.current.session).toEqual(session);

    await act(async () => {
      view.result.current.restart();
    });
    expect(source.start).toHaveBeenCalledTimes(2);
    expect(view.result.current.status).toBe('verifying');
  });
});

describe('useVerification - token refresh', () => {
  it('posts the refreshed token into the frame and keeps verifying', async () => {
    const refreshToken = jest.fn(async () => 'tok-2');
    const source = { ...hostedSource(), refreshToken };
    const options = handlers();
    const view = mount(source, options);
    await act(async () => {
      view.result.current.start();
    });
    const postMessage = jest.fn();
    view.result.current.iframeRef.current = {
      contentWindow: { postMessage },
    };

    await act(async () => {
      view.result.current.handleMessage(messageOf({ type: 'tokenExpired' }));
    });

    expect(refreshToken).toHaveBeenCalledWith(session);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][1]).toBe(ORIGIN);
    expect(view.result.current.status).toBe('verifying');
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('fails a non-refreshable source with TOKEN_EXPIRED and keeps the session', async () => {
    const options = handlers();
    const view = mount(hostedSource(), options);
    await act(async () => {
      view.result.current.start();
    });

    act(() => {
      view.result.current.handleMessage(messageOf({ type: 'tokenExpired' }));
    });

    expect(view.result.current.status).toBe('error');
    expect(view.result.current.error?.code).toBe(
      ClientErrorCodes.TOKEN_EXPIRED,
    );
    expect(view.result.current.session).toEqual(session);
  });

  it('fails a rejected refresh with TOKEN_REFRESH_FAILED and keeps the session', async () => {
    const source = {
      ...hostedSource(),
      refreshToken: jest.fn(async () => {
        throw { code: 'PROVIDER_UNAVAILABLE' };
      }),
    };
    const options = handlers();
    const view = mount(source, options);
    await act(async () => {
      view.result.current.start();
    });

    await act(async () => {
      view.result.current.handleMessage(messageOf({ type: 'tokenExpired' }));
    });

    expect(view.result.current.status).toBe('error');
    expect(view.result.current.error?.code).toBe(
      ClientErrorCodes.TOKEN_REFRESH_FAILED,
    );
    expect(view.result.current.session).toEqual(session);
    expect(options.onError).toHaveBeenCalledWith(view.result.current.error);
  });
});

describe('useVerification - unmount safety', () => {
  it('drops a late session and a late message', async () => {
    let resolveStart!: (value: VerificationSession) => void;
    const source = hostedSource({
      start: jest.fn(
        () =>
          new Promise<VerificationSession>(resolve => {
            resolveStart = resolve;
          }),
      ),
    });
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });
    const api = view.result.current;
    view.unmount();
    await act(async () => {
      resolveStart(session);
    });

    act(() => {
      api.handleMessage(messageOf({ type: 'cancel' }));
    });
    expect(options.onCancel).not.toHaveBeenCalled();
  });

  it('drops a late rejection', async () => {
    let rejectStart!: (cause: unknown) => void;
    const source = hostedSource({
      start: jest.fn(
        () =>
          new Promise<VerificationSession>((_resolve, reject) => {
            rejectStart = reject;
          }),
      ),
    });
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.retry();
    });
    view.unmount();
    await act(async () => {
      rejectStart({ code: 'PROVIDER_UNAVAILABLE' });
    });

    expect(options.onError).not.toHaveBeenCalled();
  });

  it('drops a delayed onComplete when the screen is gone', async () => {
    jest.useFakeTimers();
    const source = hostedSource();
    const options = handlers();
    const view = mount(source, options);
    await act(async () => {
      view.result.current.start();
    });
    act(() => {
      view.result.current.handleMessage(
        messageOf({ type: 'complete', status: 'approved' }),
      );
    });

    view.unmount();
    jest.runAllTimers();

    expect(options.onComplete).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('guards the delayed onComplete even if the cleanup could not cancel the timer', async () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest
      .spyOn(window, 'clearTimeout')
      .mockImplementation(() => undefined);
    const source = hostedSource();
    const options = handlers();
    const view = mount(source, options);
    await act(async () => {
      view.result.current.start();
    });
    act(() => {
      view.result.current.handleMessage(
        messageOf({ type: 'complete', status: 'approved' }),
      );
    });

    view.unmount();
    jest.runAllTimers();

    expect(options.onComplete).not.toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  it('retires the delayed onComplete of the run it replaces', async () => {
    jest.useFakeTimers();
    const options = handlers();
    const view = mount(hostedSource(), options);
    await act(async () => {
      view.result.current.start();
    });
    act(() => {
      view.result.current.handleEvent({ type: 'complete', status: 'approved' });
    });

    // The restart is a new run; the previous run's onComplete must not land
    // on it. Going offline first keeps the new run observable and short.
    setNavigatorOnline(false);
    await act(async () => {
      view.result.current.restart();
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(view.result.current.status).toBe('offline');
    expect(options.onComplete).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('retires the delayed onComplete on cancel', async () => {
    jest.useFakeTimers();
    const options = handlers();
    const view = mount(hostedSource(), options);
    await act(async () => {
      view.result.current.start();
    });
    act(() => {
      view.result.current.handleEvent({ type: 'complete', status: 'approved' });
    });

    act(() => {
      view.result.current.cancel();
    });
    act(() => {
      jest.runAllTimers();
    });

    expect(options.onComplete).not.toHaveBeenCalled();
    expect(options.onCancel).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toBe('idle');
    jest.useRealTimers();
  });

  it('drops a launch result that arrives after unmount', async () => {
    let resolveLaunch!: (result: { status: 'approved' }) => void;
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: () =>
        new Promise(resolve => {
          resolveLaunch = resolve as (result: { status: 'approved' }) => void;
        }),
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });
    view.unmount();
    await act(async () => {
      resolveLaunch({ status: 'approved' });
    });

    expect(options.onComplete).not.toHaveBeenCalled();
  });

  it('drops a launch rejection that arrives after unmount', async () => {
    let rejectLaunch!: (cause: unknown) => void;
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: () =>
        new Promise((_resolve, reject) => {
          rejectLaunch = reject;
        }),
    } as VerificationSource;
    const options = handlers();
    const view = mount(source, options);

    await act(async () => {
      view.result.current.start();
    });
    view.unmount();
    await act(async () => {
      rejectLaunch({ code: 'SDK_UNAVAILABLE' });
    });

    expect(options.onError).not.toHaveBeenCalled();
  });

  it('honours a custom successDelayMs', async () => {
    jest.useFakeTimers();
    const options = handlers({ successDelayMs: 0 });
    const view = mount(hostedSource(), options);
    await act(async () => {
      view.result.current.start();
    });

    act(() => {
      view.result.current.handleEvent({ type: 'complete', status: 'approved' });
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });

    expect(options.onComplete).toHaveBeenCalledWith({ status: 'approved' });
    jest.useRealTimers();
  });

  it('works without an onStatusChange handler', async () => {
    const options = handlers({ onStatusChange: undefined });
    const view = mount(hostedSource(), options);
    await act(async () => {
      view.result.current.start();
    });

    act(() => {
      view.result.current.handleMessage(
        messageOf({ type: 'statusChanged', status: 'incomplete' }),
      );
    });

    expect(view.result.current.status).toBe('verifying');
  });
});
