import React, { forwardRef, useEffect, useImperativeHandle } from 'react';
import { View } from 'react-native';

export interface WebViewMessageEvent {
  nativeEvent: { data: string };
}

export interface WebViewMockProps {
  testID?: string;
  source?: { uri: string };
  onMessage?: (event: WebViewMessageEvent) => void;
  onError?: () => void;
  onHttpError?: () => void;
  style?: object;
  [prop: string]: unknown;
}

// forwardRef's PropsWithoutRef<P> maps over `keyof P`, which collapses to
// `string` when P carries a string index signature - that silently widens
// every named prop (testID, source, onMessage, ...) to `unknown` inside the
// render function. So the render function itself is typed with this
// index-signature-free variant, and the wider WebViewMockProps (used by
// getWebViewProps()/simulateWebViewError() for arbitrary prop lookups) is
// applied only via a cast when the props are stored - safe, since at
// runtime `props` already holds every prop the caller spread in.
interface WebViewMockRenderProps {
  testID?: string;
  source?: { uri: string };
  onMessage?: (event: WebViewMessageEvent) => void;
  onError?: () => void;
  onHttpError?: () => void;
  style?: object;
}

export interface WebViewMockHandle {
  injectJavaScript(script: string): void;
}

declare global {
  var __webViewMockHandler: ((event: WebViewMessageEvent) => void) | undefined;
  var __webViewMockProps: WebViewMockProps | undefined;
  var __webViewMockInjected: string[] | undefined;
}

/** Every prop the component under test passed to the WebView. */
export const getWebViewProps = (): WebViewMockProps =>
  globalThis.__webViewMockProps ?? {};

/** Scripts pushed through the ref's injectJavaScript, in order. */
export const getInjectedScripts = (): string[] =>
  globalThis.__webViewMockInjected ?? [];

export const WebView = forwardRef<WebViewMockHandle, WebViewMockRenderProps>(
  (props, ref) => {
    const { testID, source, onMessage } = props;

    useImperativeHandle(ref, () => ({
      injectJavaScript: (script: string) => {
        globalThis.__webViewMockInjected = [
          ...(globalThis.__webViewMockInjected ?? []),
          script,
        ];
      },
    }));

    useEffect(() => {
      globalThis.__webViewMockHandler = onMessage;
      globalThis.__webViewMockProps = props as WebViewMockProps;
      return () => {
        globalThis.__webViewMockHandler = undefined;
      };
    });

    return (
      <View
        testID={testID}
        accessibilityLabel={source?.uri}
        accessibilityHint="mock-webview"
      />
    );
  },
);
WebView.displayName = 'WebView';

export const simulateWebViewMessage = (data: object) => {
  globalThis.__webViewMockHandler?.({
    nativeEvent: { data: JSON.stringify(data) },
  });
};

export const simulateRawWebViewMessage = (rawData: string) => {
  globalThis.__webViewMockHandler?.({ nativeEvent: { data: rawData } });
};

export const simulateWebViewError = () => {
  globalThis.__webViewMockProps?.onError?.();
};

export const simulateWebViewHttpError = () => {
  globalThis.__webViewMockProps?.onHttpError?.();
};

export const resetWebViewMock = () => {
  globalThis.__webViewMockHandler = undefined;
  globalThis.__webViewMockProps = undefined;
  globalThis.__webViewMockInjected = undefined;
};

export default WebView;
