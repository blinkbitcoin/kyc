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

export * from '@blinkbitcoin/kyc-core/hosted';
