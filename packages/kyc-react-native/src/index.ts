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
//   <Verification source={source} onComplete onError onCancel />

export { Verification, DEFAULT_LABEL } from './Verification';
export { useVerification, DEFAULT_SUCCESS_DELAY_MS } from './useVerification';
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
export {
  describeOutcome,
  initialMachineState,
  isRestartableError,
  machineReducer,
  planEvent,
  toVerificationError,
  UNKNOWN_ERROR_CODE,
} from './verificationMachine';
export type * from './types';

// The whole platform-agnostic core, re-exported for convenience (this entry
// includes the Apollo-backed proxy source and client factory).
export * from '@blinkbitcoin/kyc-core';
