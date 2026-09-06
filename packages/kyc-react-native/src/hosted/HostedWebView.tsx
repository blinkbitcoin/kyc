// The hosted page, embedded. Applies createHostedWebViewProps, forwards the
// page's raw messages to the caller, and turns a load failure into the
// normalized NETWORK_ERROR event (this package is where NETWORK_ERROR is
// produced - the sources never invent it).

import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ClientErrorCodes } from '@blinkbitcoin/kyc-core/hosted';

import { createHostedWebViewProps } from './webViewProps';

import type { MutableRefObject, ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { VerificationEvent } from '@blinkbitcoin/kyc-core/hosted';
import type { TokenInjectable } from '../useTokenRefresh';

export const HOSTED_WEBVIEW_TEST_ID = 'verification-webview';

export interface HostedWebViewProps {
  /** The hosted page URL from the session. */
  url: string;
  /** postMessage origin pin; defaults to the url's own origin. */
  allowedOrigin?: string;
  /** Extra origins the page may navigate to, e.g. 'https://*.sumsub.com'. */
  allowedNavigationOrigins?: string[];
  /** Raw page payload, straight from onMessage - feed it to interpret(). */
  onMessage: (raw: string) => void;
  /** Normalized events this view produces itself (load failures). */
  onEvent: (event: VerificationEvent) => void;
  /** Attach to push token refreshes into the page. */
  webViewRef?: MutableRefObject<TokenInjectable | null>;
  renderLoading?: () => ReactElement;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const HostedWebView: React.FC<HostedWebViewProps> = ({
  url,
  allowedOrigin,
  allowedNavigationOrigins,
  onMessage,
  onEvent,
  webViewRef,
  renderLoading,
  style,
  testID = HOSTED_WEBVIEW_TEST_ID,
}) => {
  const hardened = useMemo(
    () =>
      createHostedWebViewProps({
        url,
        allowedOrigin,
        allowedNavigationOrigins,
      }),
    [url, allowedOrigin, allowedNavigationOrigins],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      onMessage(event.nativeEvent.data);
    },
    [onMessage],
  );

  const handleLoadError = useCallback(() => {
    onEvent({ type: 'error', code: ClientErrorCodes.NETWORK_ERROR });
  }, [onEvent]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        {...hardened}
        // The hook only needs injectJavaScript; WebView satisfies that shape.
        // WebView is generic (default P = undefined); a bare `WebView` ref
        // type collapses JSX's prop inference to `never` (P & undefined),
        // hence the `<object>` argument here.
        ref={webViewRef as unknown as React.Ref<WebView<object>>}
        testID={testID}
        source={{ uri: url }}
        style={styles.webview}
        onMessage={handleMessage}
        onError={handleLoadError}
        onHttpError={handleLoadError}
        renderLoading={renderLoading}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%' },
  webview: { flex: 1 },
});
