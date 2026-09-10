// @blinkbitcoin/kyc-react-native/hosted - the Apollo-free entry.
//
// For apps that only run the native-SDK or hosted-page modes: nothing
// reachable from this file imports '@apollo/client' or 'graphql', so those
// optional peers never need to be installed. Enforced by the import-graph
// guard test and by scripts/pack-smoke.sh. Proxy-mode apps import the
// package root instead.
//
//   import { Verification, createHostedSource } from '@blinkbitcoin/kyc-react-native/hosted';

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
export type * from './types';
// This package's labels extend core's under the same name; naming the
// re-export is what resolves the clash with the core re-export below.
export type { VerificationLabels } from './types';
export {
  baseStyles,
  DEFAULT_LABELS,
  resolveLabels,
  resolveStyles,
} from './theme';

export * from '@blinkbitcoin/kyc-core/hosted';
