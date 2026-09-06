import { fireEvent, render, screen } from '@testing-library/react';
import { ClientErrorCodes, createBridgeMessage } from '@blinkbitcoin/kyc-core';

import {
  DEFAULT_FRAME_TITLE,
  HostedFrame,
  HOSTED_FRAME_TEST_ID,
} from '../HostedFrame';
import {
  FRAME_ALLOW,
  FRAME_REFERRER_POLICY,
  FRAME_SANDBOX,
} from '../frameProps';

import type { RefObject } from 'react';
import type { TokenPostable } from '../../useTokenRefresh';

const ORIGIN = 'https://kyc.example.com';
const URL = `${ORIGIN}/hosted/sess-1`;

const frameOf = (): HTMLIFrameElement =>
  screen.getByTestId(HOSTED_FRAME_TEST_ID) as HTMLIFrameElement;

const post = (data: unknown, origin: string, source: unknown): void => {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { value: source });
  fireEvent(window, event);
};

describe('HostedFrame', () => {
  it('renders the page with the hardened attributes and the default test id', () => {
    render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        onMessage={jest.fn()}
        onEvent={jest.fn()}
      />,
    );

    const frame = frameOf();
    expect(frame.getAttribute('src')).toBe(URL);
    expect(frame.getAttribute('title')).toBe(DEFAULT_FRAME_TITLE);
    expect(frame.getAttribute('allow')).toBe(FRAME_ALLOW);
    expect(frame.getAttribute('sandbox')).toBe(FRAME_SANDBOX);
    expect(frame.getAttribute('referrerpolicy')).toBe(FRAME_REFERRER_POLICY);
  });

  it('honours a custom title, test id and style', () => {
    render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        title="Verify your identity"
        testId="custom-frame"
        style={{ minHeight: 100 }}
        onMessage={jest.fn()}
        onEvent={jest.fn()}
      />,
    );

    const frame = screen.getByTestId('custom-frame');
    expect(frame.getAttribute('title')).toBe('Verify your identity');
    expect((frame.parentElement as HTMLElement).style.minHeight).toBe('100px');
  });

  it('forwards a message from the pinned origin sent by the frame', () => {
    const onMessage = jest.fn();
    render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        onMessage={onMessage}
        onEvent={jest.fn()}
      />,
    );
    const envelope = createBridgeMessage('submitted');

    post(envelope, ORIGIN, frameOf().contentWindow);

    expect(onMessage).toHaveBeenCalledWith(envelope);
  });

  it('ignores a message from another origin or another window', () => {
    const onMessage = jest.fn();
    render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        onMessage={onMessage}
        onEvent={jest.fn()}
      />,
    );

    post(
      createBridgeMessage('cancel'),
      'https://evil.example',
      frameOf().contentWindow,
    );
    post(createBridgeMessage('cancel'), ORIGIN, window);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores a message when the frame has no content window', () => {
    const onMessage = jest.fn();
    render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        onMessage={onMessage}
        onEvent={jest.fn()}
      />,
    );
    Object.defineProperty(frameOf(), 'contentWindow', {
      configurable: true,
      value: null,
    });

    post(createBridgeMessage('submitted'), ORIGIN, null);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores everything and warns once when the session carries no origin pin', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onMessage = jest.fn();
    const view = render(
      <HostedFrame url={URL} onMessage={onMessage} onEvent={jest.fn()} />,
    );

    post(createBridgeMessage('submitted'), ORIGIN, frameOf().contentWindow);
    expect(onMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('allowedOrigin');

    // A re-render with the same props must not warn again.
    view.rerender(
      <HostedFrame url={URL} onMessage={onMessage} onEvent={jest.fn()} />,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('always forwards to the latest onMessage handler', () => {
    const first = jest.fn();
    const second = jest.fn();
    const view = render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        onMessage={first}
        onEvent={jest.fn()}
      />,
    );
    view.rerender(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        onMessage={second}
        onEvent={jest.fn()}
      />,
    );

    post(createBridgeMessage('submitted'), ORIGIN, frameOf().contentWindow);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', () => {
    const onMessage = jest.fn();
    const view = render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        onMessage={onMessage}
        onEvent={jest.fn()}
      />,
    );
    const contentWindow = frameOf().contentWindow;
    view.unmount();

    post(createBridgeMessage('submitted'), ORIGIN, contentWindow);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('turns a frame load failure into a NETWORK_ERROR event', () => {
    const onEvent = jest.fn();
    render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        onMessage={jest.fn()}
        onEvent={onEvent}
      />,
    );

    fireEvent.error(frameOf());

    expect(onEvent).toHaveBeenCalledWith({
      type: 'error',
      code: ClientErrorCodes.NETWORK_ERROR,
    });
  });

  it('publishes the frame element through the caller ref', () => {
    const frameRef = { current: null } as RefObject<TokenPostable | null>;
    const view = render(
      <HostedFrame
        url={URL}
        allowedOrigin={ORIGIN}
        frameRef={frameRef}
        onMessage={jest.fn()}
        onEvent={jest.fn()}
      />,
    );

    expect(frameRef.current).toBe(frameOf());
    view.unmount();
    expect(frameRef.current).toBeNull();
  });
});
