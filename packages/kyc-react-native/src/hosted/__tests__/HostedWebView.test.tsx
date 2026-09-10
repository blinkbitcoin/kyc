import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ClientErrorCodes } from '@blinkbitcoin/kyc-core/hosted';
import {
  getInjectedScripts,
  getWebViewProps,
  resetWebViewMock,
  simulateRawWebViewMessage,
  simulateWebViewError,
  simulateWebViewHttpError,
} from '../../../__mocks__/react-native-webview';

import { HostedWebView, HOSTED_WEBVIEW_TEST_ID } from '../HostedWebView';
import { BRIDGE_STUB_SCRIPT } from '../webViewProps';

import type { MutableRefObject } from 'react';
import type { VerificationEvent } from '@blinkbitcoin/kyc-core/hosted';
import type { TokenInjectable } from '../../useTokenRefresh';

const URL = 'https://kyc.example.com/hosted/sess-1';

const render = async (element: React.ReactElement) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
};

beforeEach(() => {
  resetWebViewMock();
});

describe('HostedWebView', () => {
  it('renders the page with the hardened props and the default testID', async () => {
    const renderer = await render(
      <HostedWebView url={URL} onMessage={jest.fn()} onEvent={jest.fn()} />,
    );

    expect(
      renderer.root.findByProps({ testID: HOSTED_WEBVIEW_TEST_ID }),
    ).toBeDefined();
    const props = getWebViewProps();
    expect(props.source).toEqual({ uri: URL });
    expect(props.mediaCapturePermissionGrantType).toBe('grant');
    expect(props.originWhitelist).toEqual(['https://kyc.example.com']);
    expect(props.injectedJavaScriptBeforeContentLoaded).toBe(
      BRIDGE_STUB_SCRIPT,
    );
  });

  it('honours an explicit origin pin, extra frame origins, style and testID', async () => {
    await render(
      <HostedWebView
        url={URL}
        allowedOrigin="https://pinned.example"
        allowedNavigationOrigins={['https://*.sumsub.com']}
        style={{ opacity: 1 }}
        testID="custom-webview"
        onMessage={jest.fn()}
        onEvent={jest.fn()}
      />,
    );

    const props = getWebViewProps();
    expect(props.testID).toBe('custom-webview');
    expect(props.originWhitelist).toEqual([
      'https://pinned.example',
      'https://*.sumsub.com',
    ]);
    const guard = props.onShouldStartLoadWithRequest as (r: {
      url: string;
    }) => boolean;
    expect(guard({ url: 'https://api.sumsub.com/frame' })).toBe(true);
  });

  it('forwards raw page messages verbatim', async () => {
    const onMessage = jest.fn();
    await render(
      <HostedWebView url={URL} onMessage={onMessage} onEvent={jest.fn()} />,
    );

    await ReactTestRenderer.act(async () => {
      simulateRawWebViewMessage('{"source":"kyc-bridge"}');
    });

    expect(onMessage).toHaveBeenCalledWith('{"source":"kyc-bridge"}');
  });

  it('turns a load failure into a NETWORK_ERROR event', async () => {
    const onEvent = jest.fn();
    await render(
      <HostedWebView url={URL} onMessage={jest.fn()} onEvent={onEvent} />,
    );

    await ReactTestRenderer.act(async () => {
      simulateWebViewError();
    });
    await ReactTestRenderer.act(async () => {
      simulateWebViewHttpError();
    });

    const expected: VerificationEvent = {
      type: 'error',
      code: ClientErrorCodes.NETWORK_ERROR,
    };
    expect(onEvent).toHaveBeenNthCalledWith(1, expected);
    expect(onEvent).toHaveBeenNthCalledWith(2, expected);
  });

  it('exposes injectJavaScript through the forwarded ref', async () => {
    const ref =
      React.createRef<TokenInjectable>() as MutableRefObject<TokenInjectable | null>;
    await render(
      <HostedWebView
        url={URL}
        webViewRef={ref}
        onMessage={jest.fn()}
        onEvent={jest.fn()}
      />,
    );

    ref.current?.injectJavaScript('true;');
    expect(getInjectedScripts()).toEqual(['true;']);
  });

  it('passes a custom loading renderer through', async () => {
    const renderLoading = () => <></>;
    await render(
      <HostedWebView
        url={URL}
        renderLoading={renderLoading}
        onMessage={jest.fn()}
        onEvent={jest.fn()}
      />,
    );

    expect(getWebViewProps().renderLoading).toBe(renderLoading);
  });
});
