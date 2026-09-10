// @blinkbitcoin/kyc-react-native - public API.
//
// Plug-and-play identity verification for React Native. The component is
// provider-agnostic: give it the VerificationSource for the mode you want.
//
//   // 1. Native provider SDK (no WebView is rendered):
//   const source = createSumsubNativeSource({ getAccessToken });
//
//   // 2. Hosted page (Apollo-free - import from '/hosted' instead):
//   const source = createHostedSource({ getSession, refreshToken });
//
//   // 3. Proxy session (this repo's backend does the orchestration):
//   const client = createKycApolloClient({ uri, getAuthToken });
//   const source = createProxySource({ client, platform: 'IOS' });
//
//   <IdentityVerification source={source} onComplete onError onCancel />

export { IdentityVerification, DEFAULT_LABEL } from './IdentityVerification';
export {
  useIdentityVerification,
  DEFAULT_SUCCESS_DELAY_MS,
} from './useIdentityVerification';
export { useTokenRefresh } from './useTokenRefresh';
export { HostedWebView, HOSTED_WEBVIEW_TEST_ID } from './hosted/HostedWebView';
export {
  BRIDGE_STUB_SCRIPT,
  createHostedWebViewProps,
  createNavigationGuard,
  FALLBACK_ORIGIN_WHITELIST,
  matchesOrigin,
  originOf,
} from './hosted/webViewProps';
export type * from './types';
// This package's labels extend core's under the same name; naming the
// re-export is what resolves the clash with the core re-export below.
export type { IdentityVerificationLabels } from './types';
export {
  baseStyles,
  DEFAULT_LABELS,
  resolveLabels,
  resolveStyles,
} from './theme';

// The whole platform-agnostic core, re-exported for convenience (this entry
// includes the Apollo-backed proxy source and client factory).
export * from '@blinkbitcoin/kyc-core';
