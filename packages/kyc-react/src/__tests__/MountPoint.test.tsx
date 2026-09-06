import { act, render, screen } from '@testing-library/react';
import { ClientErrorCodes } from '@blinkbitcoin/kyc-core';

import { MountPoint, MOUNT_POINT_TEST_ID } from '../MountPoint';

import type {
  VerificationEvent,
  VerificationSession,
} from '@blinkbitcoin/kyc-core';
import type { MountableSource } from '../mountable';

const session: VerificationSession = {
  provider: 'mock',
  sessionId: 'sess-1',
  accessToken: 'tok-1',
};

const mountableSource = (mount: MountableSource['mount']): MountableSource => ({
  start: async () => session,
  interpret: () => null,
  mount,
});

describe('MountPoint', () => {
  it('hands the container and the session to the source', () => {
    const cleanup = jest.fn();
    const mount = jest.fn<
      ReturnType<MountableSource['mount']>,
      Parameters<MountableSource['mount']>
    >(() => cleanup);
    render(
      <MountPoint
        source={mountableSource(mount)}
        session={session}
        onEvent={jest.fn()}
      />,
    );

    const container = screen.getByTestId(MOUNT_POINT_TEST_ID);
    expect(container.tagName).toBe('DIV');
    expect(mount).toHaveBeenCalledTimes(1);
    expect(mount.mock.calls[0][0]).toBe(container);
    expect(mount.mock.calls[0][1]).toBe(session);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('forwards the source events, always to the latest handler', () => {
    let emit!: (event: VerificationEvent) => void;
    const source = mountableSource((_container, _session, onEvent) => {
      emit = onEvent;
      return () => {};
    });
    const first = jest.fn();
    const second = jest.fn();
    const view = render(
      <MountPoint source={source} session={session} onEvent={first} />,
    );

    act(() => emit({ type: 'submitted' }));
    expect(first).toHaveBeenCalledWith({ type: 'submitted' });

    view.rerender(
      <MountPoint source={source} session={session} onEvent={second} />,
    );
    act(() => emit({ type: 'cancel' }));
    expect(second).toHaveBeenCalledWith({ type: 'cancel' });
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount and when the session is replaced', () => {
    const cleanup = jest.fn();
    const source = mountableSource(() => cleanup);
    const view = render(
      <MountPoint source={source} session={session} onEvent={jest.fn()} />,
    );

    view.rerender(
      <MountPoint
        source={source}
        session={{ ...session, sessionId: 'sess-2' }}
        onEvent={jest.fn()}
      />,
    );
    expect(cleanup).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('reports a throwing mount as a coded error event', () => {
    const onEvent = jest.fn();
    const source = mountableSource(() => {
      throw { code: 'PROVIDER_UNAVAILABLE', message: 'sdk refused' };
    });
    render(<MountPoint source={source} session={session} onEvent={onEvent} />);

    expect(onEvent).toHaveBeenCalledWith({
      type: 'error',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'sdk refused',
    });
  });

  it('falls back to SDK_UNAVAILABLE when the failure carries no code', () => {
    const onEvent = jest.fn();
    const source = mountableSource(() => {
      throw new Error('boom');
    });
    render(<MountPoint source={source} session={session} onEvent={onEvent} />);

    expect(onEvent).toHaveBeenCalledWith({
      type: 'error',
      code: ClientErrorCodes.SDK_UNAVAILABLE,
      message: 'boom',
    });
  });

  it('honours a custom test id and style', () => {
    render(
      <MountPoint
        source={mountableSource(() => () => {})}
        session={session}
        onEvent={jest.fn()}
        testId="custom-mount"
        style={{ minHeight: 100 }}
      />,
    );

    const container = screen.getByTestId('custom-mount');
    expect(container.style.minHeight).toBe('100px');
  });
});
