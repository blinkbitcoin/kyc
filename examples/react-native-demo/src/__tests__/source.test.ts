import {
  isLaunchable,
  isTokenRefreshable,
} from '@blinkbitcoin/kyc-react-native';

import { buildSource, demoPlatform } from '../source';

import type { ApolloClient } from '@apollo/client';
import type {
  LaunchableSource,
  VerificationEvent,
} from '@blinkbitcoin/kyc-react-native';

const fakeClient = () =>
  ({ mutate: jest.fn(), query: jest.fn() }) as unknown as ApolloClient;

describe('demoPlatform', () => {
  it('maps the RN platform onto the backend enum', () => {
    expect(demoPlatform('ios')).toBe('IOS');
    expect(demoPlatform('android')).toBe('ANDROID');
  });
});

describe('buildSource - proxy', () => {
  it('returns a refreshable proxy source and no fake controller', () => {
    const { source, controller } = buildSource('proxy', {
      client: fakeClient(),
    });

    expect(typeof source.start).toBe('function');
    expect(isTokenRefreshable(source)).toBe(true);
    expect(controller).toBeNull();
  });

  it('falls back to the demo Apollo client when none is injected', () => {
    expect(buildSource('proxy').controller).toBeNull();
  });
});

describe('buildSource - hosted', () => {
  it('fetches the session from the backend proxy and can refresh its token', async () => {
    const mutate = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          verificationSessionStart: {
            provider: 'mock',
            sessionId: 's-1',
            url: 'http://localhost:5100/hosted/s-1',
            allowedOrigin: 'http://localhost:5100',
            accessToken: 'tok-1',
          },
        },
      })
      .mockResolvedValueOnce({
        data: { verificationSessionRefresh: { accessToken: 'tok-2' } },
      });

    const { source } = buildSource('hosted', {
      client: { mutate, query: jest.fn() } as unknown as ApolloClient,
    });

    await expect(source.start()).resolves.toMatchObject({
      url: 'http://localhost:5100/hosted/s-1',
      allowedOrigin: 'http://localhost:5100',
    });
    expect(isTokenRefreshable(source)).toBe(true);
    if (isTokenRefreshable(source)) {
      await expect(
        source.refreshToken({ provider: 'mock', sessionId: 's-1' }),
      ).resolves.toBe('tok-2');
    }
  });
});

describe('buildSource - native', () => {
  it('returns a launchable Sumsub source fed by the backend proxy', async () => {
    const mutate = jest.fn().mockResolvedValue({
      data: {
        verificationSessionStart: {
          provider: 'sumsub',
          sessionId: 's-2',
          accessToken: 'tok-9',
        },
      },
    });
    const { source, controller } = buildSource('native', {
      client: { mutate, query: jest.fn() } as unknown as ApolloClient,
    });

    expect(isLaunchable(source)).toBe(true);
    expect(controller).toBeNull();
    await expect(source.start()).resolves.toEqual({
      provider: 'sumsub',
      accessToken: 'tok-9',
    });
  });

  it('refuses to start when the backend mints no access token', async () => {
    const mutate = jest.fn().mockResolvedValue({
      data: {
        verificationSessionStart: { provider: 'sumsub', sessionId: 's-3' },
      },
    });
    const { source } = buildSource('native', {
      client: { mutate, query: jest.fn() } as unknown as ApolloClient,
    });

    await expect(source.start()).rejects.toThrow(/no access token/i);
  });
});

describe('buildSource - fake-native', () => {
  const collect = () => {
    const events: VerificationEvent[] = [];
    return {
      events,
      onEvent: (event: VerificationEvent) => events.push(event),
    };
  };

  it('exposes the fake controller and reports the launch window', async () => {
    const onLaunchingChange = jest.fn();
    const { source, controller } = buildSource('fake-native', {
      onLaunchingChange,
    });

    expect(isLaunchable(source)).toBe(true);
    expect(controller).not.toBeNull();
    await expect(source.start()).resolves.toMatchObject({ provider: 'fake' });
    expect(
      source.interpret({ source: 'kyc-bridge', v: 1, type: 'cancel' }),
    ).toEqual({ type: 'cancel' });

    const { events, onEvent } = collect();
    const pending = (source as LaunchableSource).launch(
      { provider: 'fake' },
      onEvent,
    );
    expect(onLaunchingChange).toHaveBeenCalledWith(true);

    controller?.approve();
    await expect(pending).resolves.toMatchObject({ status: 'approved' });
    expect(onLaunchingChange).toHaveBeenLastCalledWith(false);
    expect(events).toContainEqual({ type: 'submitted' });
  });

  it('reports the launch window closing when the fake rejects', async () => {
    const onLaunchingChange = jest.fn();
    const { source, controller } = buildSource('fake-native', {
      onLaunchingChange,
    });

    const { onEvent } = collect();
    const pending = (source as LaunchableSource).launch(
      { provider: 'fake' },
      onEvent,
    );
    controller?.fail('SDK_UNAVAILABLE', 'nope');
    await expect(pending).rejects.toEqual({
      code: 'SDK_UNAVAILABLE',
      message: 'nope',
    });
    expect(onLaunchingChange).toHaveBeenLastCalledWith(false);
  });

  it('needs no options at all', () => {
    expect(buildSource('fake-native').controller).not.toBeNull();
  });

  it('launches without a launch-window listener when none is given', async () => {
    const { source, controller } = buildSource('fake-native');
    const session = await source.start();
    const launch = (source as LaunchableSource).launch(session, jest.fn());
    controller?.approve();
    await expect(launch).resolves.toMatchObject({ status: 'approved' });
  });
});
