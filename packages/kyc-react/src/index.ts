// @blinkbitcoin/kyc-react - public API.
//
// Plug-and-play identity verification for React web apps. The component is
// provider-agnostic: give it the VerificationSource for the mode you want.
//
//   // Hosted page (Apollo-free - import from '/hosted' instead):
//   const source = createHostedSource({ getSession, refreshToken });
//
//   // Proxy session (this repo's backend does the orchestration):
//   const client = createKycApolloClient({ uri, getAuthToken });
//   const source = createProxySource({ client, platform: 'WEB' });
//
//   <Verification source={source} onComplete onError onCancel />
//
// A provider web SDK that renders itself implements MountableSource; the
// component then hands it a container instead of embedding a URL. No such
// adapter ships in v1 - Sumsub's web SDK is itself an iframe, so the hosted
// mode already covers the browser.

export { Verification, DEFAULT_LABEL } from './Verification';
export { useVerification, DEFAULT_SUCCESS_DELAY_MS } from './useVerification';
export { useTokenRefresh } from './useTokenRefresh';
export {
  HostedFrame,
  DEFAULT_FRAME_TITLE,
  HOSTED_FRAME_TEST_ID,
} from './hosted/HostedFrame';
export {
  createHostedFrameProps,
  createMessageGuard,
  FRAME_ALLOW,
  FRAME_REFERRER_POLICY,
  FRAME_SANDBOX,
} from './hosted/frameProps';
export { MountPoint, MOUNT_POINT_TEST_ID } from './MountPoint';
export { isMountable } from './mountable';
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

// The whole platform-agnostic core, re-exported for convenience - including
// the shared state machine, the bridge protocol, the Apollo-backed proxy
// source and the client factory. Hosted-only apps import ./hosted instead:
// a bundler would tree-shake the Apollo pieces out of this entry too
// ("sideEffects": false), but the subpath makes the Apollo-free contract a
// tested guarantee rather than a bundler property, and gives both
// platforms the same import.
export * from '@blinkbitcoin/kyc-core';
