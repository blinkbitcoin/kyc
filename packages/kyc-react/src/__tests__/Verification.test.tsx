import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  ClientErrorCodes,
  createBridgeMessage,
  getErrorMessage,
} from '@blinkbitcoin/kyc-core';

import { Verification } from '../Verification';

import type {
  VerificationEvent,
  VerificationSession,
  VerificationSource,
} from '@blinkbitcoin/kyc-core';
import type { MountableSource } from '../mountable';
import type { VerificationProps } from '../types';

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

const props = (over: Partial<VerificationProps> = {}): VerificationProps => ({
  source: hostedSource(),
  onComplete: jest.fn(),
  onError: jest.fn(),
  onCancel: jest.fn(),
  ...over,
});

const setNavigatorOnline = (value: boolean): void => {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
};

const has = (testId: string): boolean => screen.queryByTestId(testId) !== null;

const click = async (testId: string): Promise<void> => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
};

/** Deliver a bridge envelope the way the real page does: object, own frame. */
const fromPage = async (event: VerificationEvent): Promise<void> => {
  const frame = screen.getByTestId('verification-iframe') as HTMLIFrameElement;
  const message = new MessageEvent('message', {
    data: { event },
    origin: ORIGIN,
  });
  Object.defineProperty(message, 'source', { value: frame.contentWindow });
  await act(async () => {
    fireEvent(window, message);
  });
};

beforeEach(() => {
  setNavigatorOnline(true);
  jest.clearAllMocks();
});

describe('Verification - idle', () => {
  it('shows the default label and starts the flow', async () => {
    const p = props();
    render(<Verification {...p} />);

    expect(screen.getByTestId('verification-start-button').textContent).toBe(
      'Verify identity',
    );

    await click('verification-start-button');
    expect(p.source.start).toHaveBeenCalledTimes(1);
    expect(has('verification-iframe')).toBe(true);
  });

  it('honours a custom label and cancels from idle', async () => {
    const p = props({ label: 'Verify me' });
    render(<Verification {...p} />);

    expect(screen.getByTestId('verification-start-button').textContent).toBe(
      'Verify me',
    );
    await click('verification-cancel-button');
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Verification - loading, mounting and launching', () => {
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
    render(<Verification {...p} />);

    await click('verification-start-button');
    expect(has('loading-indicator')).toBe(true);

    await act(async () => {
      resolveStart(session);
    });
    expect(has('verification-iframe')).toBe(true);
  });

  it('hands a mountable source its container instead of an iframe', async () => {
    const cleanup = jest.fn();
    const mount = jest.fn(
      (
        _container: HTMLElement,
        _session: VerificationSession,
        _onEvent: (event: VerificationEvent) => void,
      ) => cleanup,
    );
    const source: MountableSource = { ...hostedSource(), mount };
    const p = props({ source });
    const view = render(<Verification {...p} />);

    await click('verification-start-button');
    expect(has('verification-mount')).toBe(true);
    expect(has('verification-iframe')).toBe(false);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[0][1]).toEqual(session);

    view.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('drives the machine from a mounted source events', async () => {
    let emit!: (event: VerificationEvent) => void;
    const source: MountableSource = {
      ...hostedSource(),
      mount: (_container, _session, onEvent) => {
        emit = onEvent;
        return () => {};
      },
    };
    const p = props({ source, successDelayMs: 0 });
    render(<Verification {...p} />);

    await click('verification-start-button');
    await act(async () => {
      emit({ type: 'complete', status: 'declined' });
    });

    expect(has('pending-screen')).toBe(true);
    expect(p.onComplete).toHaveBeenCalledWith({ status: 'declined' });
  });

  it('renders no page for a launchable source', async () => {
    let resolveLaunch!: (result: { status: 'approved' }) => void;
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: () =>
        new Promise(resolve => {
          resolveLaunch = resolve as (result: { status: 'approved' }) => void;
        }),
    } as VerificationSource;
    render(<Verification {...props({ source, successDelayMs: 0 })} />);

    await click('verification-start-button');
    expect(has('verification-iframe')).toBe(false);
    expect(has('launch-screen')).toBe(true);

    await act(async () => {
      resolveLaunch({ status: 'approved' });
    });
    expect(has('success-screen')).toBe(true);
  });
});

describe('Verification - the hosted page', () => {
  const start = async (p: VerificationProps) => {
    render(<Verification {...p} />);
    await click('verification-start-button');
  };

  it('routes page messages through the source and shows the outcome screen', async () => {
    const p = props({ successDelayMs: 0 });
    await start(p);

    await fromPage({ type: 'submitted' });
    expect(has('pending-screen')).toBe(true);
    expect(screen.getByTestId('pending-message').textContent).toMatch(
      /reviewing/i,
    );

    await fromPage({ type: 'complete', status: 'declined' });
    expect(screen.getByTestId('pending-message').textContent).toMatch(
      /try again/i,
    );
    expect(p.onComplete).toHaveBeenCalledWith({ status: 'declined' });
  });

  it('keeps the one iframe mounted, hidden and inert, across verifying and pending', async () => {
    const p = props({ successDelayMs: 0 });
    await start(p);
    const frame = screen.getByTestId('verification-iframe');
    const wrapper = frame.parentElement?.parentElement as HTMLElement;
    expect(wrapper.hasAttribute('hidden')).toBe(false);
    expect(wrapper.getAttribute('aria-hidden')).toBe('false');

    // The page keeps talking after 'submitted' - a remount would reload it
    // and drop the provider's in-page state, so the SAME element must stay.
    await fromPage({ type: 'submitted' });
    expect(has('pending-screen')).toBe(true);
    expect(screen.getByTestId('verification-iframe')).toBe(frame);
    expect(wrapper.hasAttribute('hidden')).toBe(true);
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(wrapper.style.visibility).toBe('hidden');

    // ...and it is still the same element after a further message.
    await fromPage({ type: 'statusChanged', status: 'incomplete' });
    expect(screen.getByTestId('verification-iframe')).toBe(frame);
  });

  it('offers a way out while the page is showing', async () => {
    const p = props();
    await start(p);
    expect(has('verification-cancel-button')).toBe(true);

    await click('verification-cancel-button');

    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(has('verification-start-button')).toBe(true);
    expect(has('verification-iframe')).toBe(false);
  });

  it('shows the success screen for an approval and then calls back', async () => {
    jest.useFakeTimers();
    const p = props();
    await start(p);

    await fromPage({ type: 'complete', status: 'approved' });
    expect(has('success-screen')).toBe(true);
    expect(p.onComplete).not.toHaveBeenCalled();

    await act(async () => {
      jest.runAllTimers();
    });
    expect(p.onComplete).toHaveBeenCalledWith({ status: 'approved' });
    jest.useRealTimers();
  });

  it('posts a refreshed token into the rendered frame', async () => {
    const p = props({
      source: {
        ...hostedSource(),
        refreshToken: async () => 'tok-2',
      } as VerificationSource,
    });
    await start(p);
    const frame = screen.getByTestId(
      'verification-iframe',
    ) as HTMLIFrameElement;
    const postMessage = jest.fn();
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    await fromPage({ type: 'tokenExpired' });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toEqual({
      source: 'kyc-bridge',
      v: 1,
      type: 'setToken',
      token: 'tok-2',
    });
    expect(postMessage.mock.calls[0][1]).toBe(ORIGIN);
  });

  it('turns a page load failure into the error screen', async () => {
    const p = props();
    await start(p);

    await act(async () => {
      fireEvent.error(screen.getByTestId('verification-iframe'));
    });

    expect(has('error-screen')).toBe(true);
    expect(screen.getByTestId('error-message').textContent).toBe(
      getErrorMessage(ClientErrorCodes.NETWORK_ERROR),
    );
    expect(p.onError).toHaveBeenCalled();
  });

  it('ignores a message that is not from the pinned origin', async () => {
    const p = props();
    await start(p);
    const message = new MessageEvent('message', {
      data: createBridgeMessage('cancel'),
      origin: 'https://evil.example',
    });
    Object.defineProperty(message, 'source', { value: window });

    await act(async () => {
      fireEvent(window, message);
    });

    expect(has('verification-iframe')).toBe(true);
    expect(p.onCancel).not.toHaveBeenCalled();
  });

  it('returns to idle when the page reports a cancel', async () => {
    const p = props();
    await start(p);

    await fromPage({ type: 'cancel' });

    expect(has('verification-start-button')).toBe(true);
    expect(p.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Verification - recovery screens', () => {
  it('shows the permission screen when the page reports a camera refusal', async () => {
    const p = props();
    render(<Verification {...p} />);
    await click('verification-start-button');

    await fromPage({ type: 'error', code: ClientErrorCodes.PERMISSION_DENIED });

    expect(has('permission-screen')).toBe(true);
    expect(
      screen.getByTestId('permission-screen').dataset.permissionReason,
    ).toBe('denied');
    // There is no OS-settings affordance on the web.
    expect(has('open-settings-button')).toBe(false);
    expect(p.onError).not.toHaveBeenCalled();

    await click('retry-button');
    expect(has('verification-iframe')).toBe(true);
  });

  it('shows the offline screen and recovers on Check connection', async () => {
    setNavigatorOnline(false);
    const p = props();
    render(<Verification {...p} />);

    await click('verification-start-button');
    expect(has('offline-screen')).toBe(true);
    expect(p.onError).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    await click('check-connection-button');
    expect(has('verification-iframe')).toBe(true);
  });

  it('stays on the offline screen while the connection is still down', async () => {
    setNavigatorOnline(false);
    const p = props();
    render(<Verification {...p} />);

    await click('verification-start-button');
    await click('check-connection-button');

    expect(has('offline-screen')).toBe(true);
    expect(p.source.start).not.toHaveBeenCalled();
    expect(p.onError).not.toHaveBeenCalled();
  });

  it('offers Retry for a plain failure and Restart for a token failure', async () => {
    const start = jest
      .fn<Promise<VerificationSession>, []>()
      .mockRejectedValueOnce({ code: 'SESSION_CREATION_FAILED' })
      .mockResolvedValue(session);
    const p = props({ source: hostedSource({ start }) });
    render(<Verification {...p} />);

    await click('verification-start-button');
    expect(has('error-screen')).toBe(true);
    expect(has('retry-button')).toBe(true);
    expect(has('restart-button')).toBe(false);

    await click('retry-button');
    expect(has('verification-iframe')).toBe(true);

    await fromPage({ type: 'sessionExpired' });
    expect(has('restart-button')).toBe(true);

    await click('restart-button');
    expect(start).toHaveBeenCalledTimes(3);
    expect(has('verification-iframe')).toBe(true);
  });

  it('cancels from the error screen', async () => {
    const p = props({
      source: hostedSource({
        start: async () => {
          throw { code: 'PROVIDER_UNAVAILABLE' };
        },
      }),
    });
    render(<Verification {...p} />);

    await click('verification-start-button');
    await click('verification-cancel-button');
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(has('verification-start-button')).toBe(true);
  });
});

describe('Verification - pass-through props', () => {
  it('forwards style, frameTitle and onStatusChange', async () => {
    const onStatusChange = jest.fn();
    const p = props({
      style: { minHeight: 200 },
      frameTitle: 'Verify your identity',
      onStatusChange,
    });
    const view = render(<Verification {...p} />);

    // `style` lands once, on the component's single root - the same place
    // Phase 5's RN component applies it.
    expect((view.container.firstChild as HTMLElement).style.minHeight).toBe(
      '200px',
    );

    await click('verification-start-button');
    expect(
      screen.getByTestId('verification-iframe').getAttribute('title'),
    ).toBe('Verify your identity');

    await fromPage({ type: 'statusChanged', status: 'incomplete' });
    expect(onStatusChange).toHaveBeenCalledWith('incomplete');
  });

  it('shows the launch placeholder when a launchable source has no page', async () => {
    const source = {
      ...hostedSource({ start: async () => ({ provider: 'sdk' }) }),
      launch: () => new Promise<never>(() => {}),
    } as VerificationSource;
    render(<Verification {...props({ source })} />);

    await click('verification-start-button');
    expect(has('launch-screen')).toBe(true);
    expect(has('verification-iframe')).toBe(false);
  });
});
