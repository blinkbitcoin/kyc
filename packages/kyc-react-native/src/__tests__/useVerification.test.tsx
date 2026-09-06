import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import NetInfo from '@react-native-community/netinfo';
import {
  resetMockNetworkState,
  setMockNetworkState,
} from '../../__mocks__/@react-native-community/netinfo';
import { ClientErrorCodes } from '@blinkbitcoin/kyc-core/hosted';
import { createFakeLaunchableSource } from '@blinkbitcoin/kyc-core/testing';

import { useVerification } from '../useVerification';

import type {
  VerificationEvent,
  VerificationSession,
  VerificationSource,
} from '@blinkbitcoin/kyc-core/hosted';
import type {
  UseVerification,
  UseVerificationOptions,
} from '../useVerification';

const session: VerificationSession = {
  provider: 'mock',
  sessionId: 'sess-1',
  url: 'https://kyc.example.com/hosted/sess-1',
  allowedOrigin: 'https://kyc.example.com',
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

let latest: UseVerification;

const Harness: React.FC<{
  source: VerificationSource;
  options: UseVerificationOptions;
}> = ({ source, options }) => {
  latest = useVerification(source, options);
  return null;
};

const handlers = (): jest.Mocked<UseVerificationOptions> =>
  ({
    onComplete: jest.fn(),
    onError: jest.fn(),
    onCancel: jest.fn(),
    onStatusChange: jest.fn(),
  }) as unknown as jest.Mocked<UseVerificationOptions>;

const render = async (
  source: VerificationSource,
  options: UseVerificationOptions,
): Promise<ReactTestRenderer.ReactTestRenderer> => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <Harness source={source} options={options} />,
    );
  });
  return renderer;
};

beforeEach(() => {
  resetMockNetworkState();
  jest.clearAllMocks();
});

describe('useVerification - acquiring a session', () => {
  it('starts idle and reaches verifying through loading', async () => {
    const source = hostedSource();
    const options = handlers();
    await render(source, options);
    expect(latest.status).toBe('idle');

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(source.start).toHaveBeenCalledTimes(1);
    expect(latest.status).toBe('verifying');
    expect(latest.session).toEqual(session);
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('maps a rejecting start() to an error state and onError', async () => {
    const source = hostedSource({
      start: jest.fn(async () => {
        throw { code: 'SESSION_CREATION_FAILED', message: 'nope' };
      }),
    });
    const options = handlers();
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.status).toBe('error');
    expect(latest.error?.code).toBe('SESSION_CREATION_FAILED');
    expect(options.onError).toHaveBeenCalledWith(latest.error);
  });

  it('falls back to UNKNOWN_ERROR when the rejection carries no code', async () => {
    const source = hostedSource({
      start: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    await render(source, handlers());

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.error).toEqual({ code: 'UNKNOWN_ERROR', message: 'boom' });
  });
});

describe('useVerification - preflight', () => {
  it('parks on permissionDenied without calling onError', async () => {
    const source = hostedSource();
    const options = handlers();
    await render(source, {
      ...options,
      checkPermissions: async () => 'blocked',
    });

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.status).toBe('permissionDenied');
    expect(source.start).not.toHaveBeenCalled();
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('continues when permission is granted', async () => {
    const source = hostedSource();
    await render(source, {
      ...handlers(),
      checkPermissions: async () => 'granted',
    });

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.status).toBe('verifying');
  });

  it('parks on offline when disconnected, and again when unreachable', async () => {
    const source = hostedSource();
    const options = handlers();
    await render(source, options);

    setMockNetworkState(false);
    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    expect(latest.status).toBe('offline');

    setMockNetworkState(true, false);
    await ReactTestRenderer.act(async () => {
      latest.retry();
    });
    expect(latest.status).toBe('offline');
    expect(options.onError).not.toHaveBeenCalled();
    expect(source.start).not.toHaveBeenCalled();
  });

  it('retry() flags the connection check and recovers when back online', async () => {
    const source = hostedSource();
    await render(source, handlers());

    setMockNetworkState(false);
    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    expect(latest.status).toBe('offline');
    expect(latest.isCheckingConnection).toBe(false);

    setMockNetworkState(true);
    await ReactTestRenderer.act(async () => {
      latest.retry();
    });
    expect(latest.status).toBe('verifying');
    expect(latest.isCheckingConnection).toBe(false);
  });
});

describe('useVerification - the launchable (native SDK) path', () => {
  it('launches instead of rendering a page and completes', async () => {
    jest.useFakeTimers();
    const source = createFakeLaunchableSource({ outcome: 'approved' });
    const options = handlers();
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.status).toBe('success');
    expect(latest.result).toEqual({
      status: 'approved',
      applicantId: 'fake-applicant',
    });
    expect(options.onStatusChange).toHaveBeenCalledWith('approved');
    expect(options.onComplete).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      jest.runAllTimers();
    });
    expect(options.onComplete).toHaveBeenCalledWith({
      status: 'approved',
      applicantId: 'fake-applicant',
    });
    jest.useRealTimers();
  });

  it('treats a cancel event during launch as an abort', async () => {
    const source = createFakeLaunchableSource({ outcome: 'cancel' });
    const options = handlers();
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.status).toBe('idle');
    expect(latest.session).toBeNull();
    expect(options.onCancel).toHaveBeenCalledTimes(1);
    expect(options.onComplete).not.toHaveBeenCalled();
  });

  it('synthesizes the terminal complete when launch resolves silently', async () => {
    const source: VerificationSource = {
      start: async () => ({ provider: 'silent' }),
      interpret: () => null,
      launch: async () => ({ status: 'incomplete', applicantId: 'app-7' }),
    } as VerificationSource;
    const options = handlers();
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.status).toBe('pending');
    expect(options.onComplete).toHaveBeenCalledWith({
      status: 'incomplete',
      applicantId: 'app-7',
    });
  });

  it('synthesizes a complete with no applicant id when the SDK reports none', async () => {
    const source: VerificationSource = {
      start: async () => ({ provider: 'silent' }),
      interpret: () => null,
      launch: async () => ({ status: 'declined' }),
    } as VerificationSource;
    const options = handlers();
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(options.onComplete).toHaveBeenCalledWith({ status: 'declined' });
  });

  it('maps a rejecting launch() to an error state', async () => {
    const source = createFakeLaunchableSource({ outcome: 'error' });
    const options = handlers();
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.status).toBe('error');
    expect(latest.error?.code).toBe(ClientErrorCodes.SDK_UNAVAILABLE);
    expect(options.onError).toHaveBeenCalledWith(latest.error);
  });

  it('falls back to a generic message when a rejecting launch carries none', async () => {
    const source: VerificationSource = {
      start: async () => ({ provider: 'silent' }),
      interpret: () => null,
      launch: async () => {
        throw { code: 'PROVIDER_UNAVAILABLE' };
      },
    } as VerificationSource;
    const options = handlers();
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.status).toBe('error');
    expect(latest.error?.code).toBe('PROVIDER_UNAVAILABLE');
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
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.error).toEqual({ code: 'UNKNOWN_ERROR', message: 'boom' });
  });

  it('does not overwrite an error the launch already reported', async () => {
    const source: VerificationSource = {
      start: async () => ({ provider: 'silent' }),
      interpret: () => null,
      launch: async (
        _s: VerificationSession,
        onEvent: (event: VerificationEvent) => void,
      ) => {
        onEvent({ type: 'error', code: 'PROVIDER_UNAVAILABLE' });
        return { status: 'incomplete' };
      },
    } as VerificationSource;
    const options = handlers();
    await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });

    expect(latest.error?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(options.onComplete).not.toHaveBeenCalled();
  });
});

describe('useVerification - bridge messages', () => {
  const messageOf = (event: VerificationEvent) => ({ event });

  const started = async (options: UseVerificationOptions) => {
    const source = hostedSource();
    await render(source, options);
    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    return source;
  };

  it('ignores a message the source does not recognise', async () => {
    const options = handlers();
    await started(options);

    await ReactTestRenderer.act(async () => {
      latest.handleMessage({ nothing: true });
    });

    expect(latest.status).toBe('verifying');
    expect(options.onStatusChange).not.toHaveBeenCalled();
  });

  it('records the applicant id, then the submission, then the outcome', async () => {
    const options = handlers();
    await started(options);

    await ReactTestRenderer.act(async () => {
      latest.handleMessage(
        messageOf({ type: 'applicantLoaded', applicantId: 'app-3' }),
      );
    });
    expect(latest.session?.applicantId).toBe('app-3');

    await ReactTestRenderer.act(async () => {
      latest.handleMessage(messageOf({ type: 'submitted' }));
    });
    expect(latest.status).toBe('pending');
    expect(options.onStatusChange).toHaveBeenCalledWith('pending');

    await ReactTestRenderer.act(async () => {
      latest.handleMessage(messageOf({ type: 'complete', status: 'pending' }));
    });
    expect(options.onComplete).toHaveBeenCalledWith({
      status: 'pending',
      applicantId: 'app-3',
    });
  });

  it('reports a page error and clears the session', async () => {
    const options = handlers();
    await started(options);

    await ReactTestRenderer.act(async () => {
      latest.handleMessage(
        messageOf({ type: 'error', code: ClientErrorCodes.NETWORK_ERROR }),
      );
    });

    expect(latest.status).toBe('error');
    expect(latest.session).toBeNull();
    expect(options.onError).toHaveBeenCalledWith(latest.error);
  });

  it('cancel() resets and calls back', async () => {
    const options = handlers();
    await started(options);

    await ReactTestRenderer.act(async () => {
      latest.cancel();
    });

    expect(latest.status).toBe('idle');
    expect(options.onCancel).toHaveBeenCalledTimes(1);
  });

  it('fails tokenExpired closed until Task 3 wires the refresh', async () => {
    const options = handlers();
    await started(options);

    await ReactTestRenderer.act(async () => {
      latest.handleMessage(messageOf({ type: 'tokenExpired' }));
    });

    expect(latest.status).toBe('error');
    expect(latest.error?.code).toBe(ClientErrorCodes.TOKEN_EXPIRED);
    expect(latest.session).toEqual(session);
  });

  it('keeps the session for restart on sessionExpired and mints a new one', async () => {
    const options = handlers();
    const source = await started(options);

    await ReactTestRenderer.act(async () => {
      latest.handleMessage(messageOf({ type: 'sessionExpired' }));
    });
    expect(latest.status).toBe('error');
    expect(latest.session).toEqual(session);

    await ReactTestRenderer.act(async () => {
      latest.restart();
    });
    expect(source.start).toHaveBeenCalledTimes(2);
    expect(latest.status).toBe('verifying');
  });
});

describe('useVerification - unmount safety', () => {
  it('drops a late session, a late launch and a late message', async () => {
    let resolveStart!: (session: VerificationSession) => void;
    const source = hostedSource({
      start: jest.fn(
        () =>
          new Promise<VerificationSession>(resolve => {
            resolveStart = resolve;
          }),
      ),
    });
    const options = handlers();
    const renderer = await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    await ReactTestRenderer.act(async () => {
      resolveStart(session);
    });

    // No state update, no callback after unmount.
    await ReactTestRenderer.act(async () => {
      latest.handleMessage({ event: { type: 'cancel' } });
    });
    expect(options.onCancel).not.toHaveBeenCalled();
  });

  it('drops a late rejection and a late connectivity check', async () => {
    let rejectStart!: (error: unknown) => void;
    const source = hostedSource({
      start: jest.fn(
        () =>
          new Promise<VerificationSession>((_resolve, reject) => {
            rejectStart = reject;
          }),
      ),
    });
    const options = handlers();
    const renderer = await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.retry();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    await ReactTestRenderer.act(async () => {
      rejectStart({ code: 'PROVIDER_UNAVAILABLE' });
    });

    expect(options.onError).not.toHaveBeenCalled();
  });

  it('drops a delayed onComplete when the screen is gone', async () => {
    jest.useFakeTimers();
    const source = createFakeLaunchableSource({ outcome: 'approved' });
    const options = handlers();
    const renderer = await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    jest.runAllTimers();

    expect(options.onComplete).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('drops a permission answer and a launch result that arrive after unmount', async () => {
    let resolvePermission!: (state: 'granted') => void;
    let resolveLaunch!: (result: { status: 'approved' }) => void;
    const source: VerificationSource = {
      start: async () => ({ provider: 'slow' }),
      interpret: () => null,
      launch: () =>
        new Promise(resolve => {
          resolveLaunch = resolve as (result: { status: 'approved' }) => void;
        }),
    } as VerificationSource;
    const options = handlers();
    const renderer = await render(source, {
      ...options,
      checkPermissions: () =>
        new Promise(resolve => {
          resolvePermission = resolve as (state: 'granted') => void;
        }),
    });

    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    await ReactTestRenderer.act(async () => {
      resolvePermission('granted');
    });
    expect(latest.status).toBe('loading');

    // A second mount runs the launch to completion, then unmounts mid-flight.
    const second = await render(source, options);
    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    await ReactTestRenderer.act(async () => {
      second.unmount();
    });
    await ReactTestRenderer.act(async () => {
      resolveLaunch({ status: 'approved' });
    });
    expect(options.onComplete).not.toHaveBeenCalled();
  });

  it('drops a launch rejection that arrives after unmount', async () => {
    let rejectLaunch!: (cause: unknown) => void;
    const source: VerificationSource = {
      start: async () => ({ provider: 'slow' }),
      interpret: () => null,
      launch: () =>
        new Promise((_resolve, reject) => {
          rejectLaunch = reject;
        }),
    } as VerificationSource;
    const options = handlers();
    const renderer = await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    await ReactTestRenderer.act(async () => {
      rejectLaunch({ code: 'PROVIDER_UNAVAILABLE' });
    });

    expect(options.onError).not.toHaveBeenCalled();
  });

  it('drops a connectivity check that resolves after unmount', async () => {
    let resolveFetch!: (state: {
      isConnected: boolean;
      isInternetReachable: boolean;
    }) => void;
    (NetInfo.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
    );
    const source = hostedSource();
    const options = handlers();
    const renderer = await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    await ReactTestRenderer.act(async () => {
      resolveFetch({ isConnected: true, isInternetReachable: true });
    });

    expect(source.start).not.toHaveBeenCalled();
  });

  it('guards the delayed onComplete even if the cleanup could not cancel the timer', async () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest
      .spyOn(global, 'clearTimeout')
      .mockImplementation(() => undefined);
    const source = createFakeLaunchableSource({ outcome: 'approved' });
    const options = handlers();
    const renderer = await render(source, options);

    await ReactTestRenderer.act(async () => {
      latest.start();
    });
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    jest.runAllTimers();

    expect(options.onComplete).not.toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });
});
