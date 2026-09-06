import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator } from 'react-native';
import {
  ClientErrorCodes,
  getErrorMessage,
} from '@blinkbitcoin/kyc-core/hosted';
import { createFakeLaunchableSource } from '@blinkbitcoin/kyc-core/testing';
import {
  resetMockNetworkState,
  setMockNetworkState,
} from '../../__mocks__/@react-native-community/netinfo';
import {
  getInjectedScripts,
  getWebViewMountCount,
  resetWebViewMock,
  simulateRawWebViewMessage,
  simulateWebViewError,
} from '../../__mocks__/react-native-webview';

import { Verification } from '../Verification';

import type {
  VerificationEvent,
  VerificationSession,
  VerificationSource,
} from '@blinkbitcoin/kyc-core/hosted';
import type { VerificationProps } from '../types';

const session: VerificationSession = {
  provider: 'mock',
  sessionId: 'sess-1',
  url: 'https://kyc.example.com/hosted/sess-1',
  allowedOrigin: 'https://kyc.example.com',
};

const bridge = (event: VerificationEvent) => JSON.stringify({ event });

const hostedSource = (
  overrides: Partial<VerificationSource> = {},
): VerificationSource => ({
  start: jest.fn(async () => session),
  interpret: (raw: unknown) =>
    (JSON.parse(raw as string) as { event: VerificationEvent }).event,
  ...overrides,
});

const props = (over: Partial<VerificationProps> = {}): VerificationProps => ({
  source: hostedSource(),
  onComplete: jest.fn(),
  onError: jest.fn(),
  onCancel: jest.fn(),
  ...over,
});

const render = async (p: VerificationProps) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Verification {...p} />);
  });
  return renderer;
};

const press = async (
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) => {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({ testID }).props.onPress();
  });
};

const has = (renderer: ReactTestRenderer.ReactTestRenderer, testID: string) =>
  renderer.root.findAllByProps({ testID }).length > 0;

beforeEach(() => {
  resetMockNetworkState();
  resetWebViewMock();
  jest.clearAllMocks();
});

describe('Verification - idle', () => {
  it('shows the default label and starts the flow', async () => {
    const p = props();
    const renderer = await render(p);

    expect(
      renderer.root.findByProps({ testID: 'verification-start-button' }).props
        .accessibilityLabel,
    ).toBe('Verify identity');

    await press(renderer, 'verification-start-button');
    expect(p.source.start).toHaveBeenCalledTimes(1);
    expect(has(renderer, 'verification-webview')).toBe(true);
  });

  it('honours a custom label and cancels from idle', async () => {
    const p = props({ label: 'Verify me' });
    const renderer = await render(p);

    expect(
      renderer.root.findByProps({ testID: 'verification-start-button' }).props
        .accessibilityLabel,
    ).toBe('Verify me');
    await press(renderer, 'verification-cancel-button');
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Verification - loading and launching', () => {
  it('shows the spinner while the session is being acquired', async () => {
    let resolveStart!: (value: VerificationSession) => void;
    const p = props({
      source: hostedSource({
        start: () =>
          new Promise<VerificationSession>(resolve => {
            resolveStart = resolve;
          }),
      }),
    });
    const renderer = await render(p);

    await press(renderer, 'verification-start-button');
    expect(renderer.root.findAllByType(ActivityIndicator).length).toBe(1);
    expect(has(renderer, 'loading-indicator')).toBe(true);

    await ReactTestRenderer.act(async () => {
      resolveStart(session);
    });
    expect(has(renderer, 'verification-webview')).toBe(true);
  });

  it('renders no WebView for a launchable source', async () => {
    let resolveLaunch!: (result: { status: 'approved' }) => void;
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sumsub' }) }),
      launch: () =>
        new Promise(resolve => {
          resolveLaunch = resolve as (result: { status: 'approved' }) => void;
        }),
    } as VerificationSource;
    const renderer = await render(props({ source, successDelayMs: 0 }));

    await press(renderer, 'verification-start-button');
    expect(has(renderer, 'verification-webview')).toBe(false);
    expect(has(renderer, 'launch-screen')).toBe(true);

    await ReactTestRenderer.act(async () => {
      resolveLaunch({ status: 'approved' });
    });
    expect(has(renderer, 'success-screen')).toBe(true);
  });
});

describe('Verification - the hosted page', () => {
  const start = async (p: VerificationProps) => {
    const renderer = await render(p);
    await press(renderer, 'verification-start-button');
    return renderer;
  };

  it('routes page messages through the source and shows the outcome screen', async () => {
    const p = props({ successDelayMs: 0 });
    const renderer = await start(p);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(bridge({ type: 'submitted' }));
    });
    expect(has(renderer, 'pending-screen')).toBe(true);
    expect(
      renderer.root.findByProps({ testID: 'pending-message' }).props.children,
    ).toMatch(/reviewing/i);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(
        bridge({ type: 'complete', status: 'declined' }),
      );
    });
    expect(
      renderer.root.findByProps({ testID: 'pending-message' }).props.children,
    ).toMatch(/try again/i);
    expect(p.onComplete).toHaveBeenCalledWith({ status: 'declined' });
  });

  it('shows the success screen for an approval and then calls back', async () => {
    jest.useFakeTimers();
    const p = props();
    const renderer = await start(p);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(
        bridge({ type: 'complete', status: 'approved' }),
      );
    });
    expect(has(renderer, 'success-screen')).toBe(true);
    expect(p.onComplete).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      jest.runAllTimers();
    });
    expect(p.onComplete).toHaveBeenCalledWith({ status: 'approved' });
    jest.useRealTimers();
  });

  it('injects a refreshed token into the rendered WebView', async () => {
    const p = props({
      source: {
        ...hostedSource(),
        refreshToken: async () => 'tok-2',
      } as VerificationSource,
    });
    await start(p);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(bridge({ type: 'tokenExpired' }));
    });

    expect(getInjectedScripts()).toHaveLength(1);
    expect(getInjectedScripts()[0]).toContain('tok-2');
  });

  it('turns a page load failure into the error screen', async () => {
    const p = props();
    const renderer = await start(p);

    await ReactTestRenderer.act(async () => {
      simulateWebViewError();
    });

    expect(has(renderer, 'error-screen')).toBe(true);
    expect(
      renderer.root.findByProps({ testID: 'error-message' }).props.children,
    ).toBe(getErrorMessage(ClientErrorCodes.NETWORK_ERROR));
    expect(p.onError).toHaveBeenCalled();
  });

  it('makes the hidden pending WebView non-interactive by construction', async () => {
    const p = props({ successDelayMs: 0 });
    const renderer = await start(p);

    expect(
      renderer.root.findAllByProps({ accessibilityElementsHidden: true })
        .length,
    ).toBe(0);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(bridge({ type: 'submitted' }));
    });
    expect(has(renderer, 'pending-screen')).toBe(true);

    const hiddenWrapper = renderer.root.findByProps({
      accessibilityElementsHidden: true,
    });
    expect(hiddenWrapper.props.pointerEvents).toBe('none');
    expect(hiddenWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
  });

  it('keeps the one WebView mounted across verifying and pending', async () => {
    // A remount would reload the hosted page (and lose the provider's in-page
    // state) exactly while the review is running.
    const p = props({ successDelayMs: 0 });
    const renderer = await start(p);
    expect(getWebViewMountCount()).toBe(1);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(bridge({ type: 'submitted' }));
    });

    expect(has(renderer, 'pending-screen')).toBe(true);
    expect(has(renderer, 'verification-webview')).toBe(true);
    expect(getWebViewMountCount()).toBe(1);

    // Still the same live page: its ref keeps taking token injections.
    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(bridge({ type: 'tokenExpired' }));
    });
    expect(getWebViewMountCount()).toBe(1);
  });

  it('offers a way out while the page is showing', async () => {
    const p = props();
    const renderer = await start(p);

    expect(has(renderer, 'verification-cancel-button')).toBe(true);
    await press(renderer, 'verification-cancel-button');

    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(has(renderer, 'verification-start-button')).toBe(true);
  });

  it('returns to idle when the page reports a cancel', async () => {
    const p = props();
    const renderer = await start(p);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(bridge({ type: 'cancel' }));
    });

    expect(has(renderer, 'verification-start-button')).toBe(true);
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Verification - recovery screens', () => {
  it('offers retry and optional settings when permission is denied', async () => {
    const onOpenSettings = jest.fn();
    const checkPermissions = jest
      .fn<Promise<'denied' | 'granted'>, []>()
      .mockResolvedValueOnce('denied')
      .mockResolvedValue('granted');
    const p = props({ checkPermissions, onOpenSettings });
    const renderer = await render(p);

    await press(renderer, 'verification-start-button');
    expect(has(renderer, 'permission-screen')).toBe(true);
    expect(p.onError).not.toHaveBeenCalled();

    await press(renderer, 'open-settings-button');
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    await press(renderer, 'retry-button');
    expect(has(renderer, 'verification-webview')).toBe(true);
  });

  it('hides the settings button when the host offers none', async () => {
    const p = props({ checkPermissions: async () => 'blocked' });
    const renderer = await render(p);

    await press(renderer, 'verification-start-button');
    expect(has(renderer, 'open-settings-button')).toBe(false);
  });

  it('shows the offline screen and recovers on Check connection', async () => {
    setMockNetworkState(false);
    const p = props();
    const renderer = await render(p);

    await press(renderer, 'verification-start-button');
    expect(has(renderer, 'offline-screen')).toBe(true);
    expect(p.onError).not.toHaveBeenCalled();

    setMockNetworkState(true);
    await press(renderer, 'check-connection-button');
    expect(has(renderer, 'verification-webview')).toBe(true);
  });

  it('offers Retry for a plain failure and Restart for a token failure', async () => {
    const start = jest
      .fn<Promise<VerificationSession>, []>()
      .mockRejectedValueOnce({ code: 'SESSION_CREATION_FAILED' })
      .mockResolvedValue(session);
    const p = props({ source: hostedSource({ start }) });
    const renderer = await render(p);

    await press(renderer, 'verification-start-button');
    expect(has(renderer, 'error-screen')).toBe(true);
    expect(has(renderer, 'retry-button')).toBe(true);
    expect(has(renderer, 'restart-button')).toBe(false);

    await press(renderer, 'retry-button');
    expect(has(renderer, 'verification-webview')).toBe(true);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(bridge({ type: 'sessionExpired' }));
    });
    expect(has(renderer, 'restart-button')).toBe(true);

    await press(renderer, 'restart-button');
    expect(start).toHaveBeenCalledTimes(3);
    expect(has(renderer, 'verification-webview')).toBe(true);
  });

  it('cancels from the error screen', async () => {
    const p = props({
      source: hostedSource({
        start: async () => {
          throw { code: 'PROVIDER_UNAVAILABLE' };
        },
      }),
    });
    const renderer = await render(p);

    await press(renderer, 'verification-start-button');
    await press(renderer, 'verification-cancel-button');
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(has(renderer, 'verification-start-button')).toBe(true);
  });
});

describe('Verification - pass-through props', () => {
  it('forwards style, renderLoading, onStatusChange and frame origins', async () => {
    const renderLoading = () => <></>;
    const onStatusChange = jest.fn();
    const p = props({
      style: { flex: 1 },
      renderLoading,
      onStatusChange,
      allowedNavigationOrigins: ['https://*.sumsub.com'],
    });
    const renderer = await render(p);

    await press(renderer, 'verification-start-button');
    const webView = renderer.root.findByProps({
      testID: 'verification-webview',
    });
    expect(webView.props.renderLoading).toBe(renderLoading);
    expect(
      (
        webView.props.onShouldStartLoadWithRequest as (r: {
          url: string;
        }) => boolean
      )({
        url: 'https://api.sumsub.com/frame',
      }),
    ).toBe(true);

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage(
        bridge({ type: 'statusChanged', status: 'incomplete' }),
      );
    });
    expect(onStatusChange).toHaveBeenCalledWith('incomplete');
  });

  it('shows the launch placeholder when a launchable source has no page', async () => {
    const source = createFakeLaunchableSource({ outcome: 'manual' });
    const renderer = await render(props({ source }));

    await press(renderer, 'verification-start-button');
    expect(has(renderer, 'launch-screen')).toBe(true);
    expect(has(renderer, 'verification-webview')).toBe(false);
  });
});
