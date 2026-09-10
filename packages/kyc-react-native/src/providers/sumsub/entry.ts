// The ./sumsub entry's surface (src/sumsub.ts re-exports this file), Apollo-free.
//
// For apps that run the Sumsub native SDK (mode 1) or embed the hosted page:
// the Sumsub provider - the native-SDK source over the optional peer
// @sumsub/react-native-mobilesdk-module, and core's mapping - plus the
// neutral layer, the component and the hook. Nothing reachable from this
// file imports '@apollo/client' or 'graphql'; enforced by the sumsub-entry
// guard test. Proxy-mode apps import the package root instead.
//
//   import { Verification, createSumsubNativeSource } from '@blinkbitcoin/kyc-react-native/sumsub';

export * from '@blinkbitcoin/kyc-core/sumsub';

export { Verification, DEFAULT_LABEL } from '../../Verification';
export {
  useVerification,
  DEFAULT_SUCCESS_DELAY_MS,
} from '../../useVerification';
export { useTokenRefresh } from '../../useTokenRefresh';
export {
  HostedWebView,
  HOSTED_WEBVIEW_TEST_ID,
} from '../../hosted/HostedWebView';
export {
  BRIDGE_STUB_SCRIPT,
  createHostedWebViewProps,
  createNavigationGuard,
  FALLBACK_ORIGIN_WHITELIST,
  matchesOrigin,
  originOf,
} from '../../hosted/webViewProps';
export type * from '../../types';
export type { VerificationLabels } from '../../types';
export {
  baseStyles,
  DEFAULT_LABELS,
  resolveLabels,
  resolveStyles,
} from '../../theme';

export {
  createSumsubNativeSource,
  SUMSUB_LAUNCH_FAILED,
} from './source';
export type { SumsubNativeSourceOptions } from './source';
export { loadSumsubSdk, SUMSUB_NATIVE_MODULE } from './sdk';
export type {
  SumsubBuilderLike,
  SumsubHandlers,
  SumsubInstanceLike,
  SumsubLogEvent,
  SumsubSdkEvent,
  SumsubSdkLike,
  SumsubStatusChangedEvent,
} from './sdk';
