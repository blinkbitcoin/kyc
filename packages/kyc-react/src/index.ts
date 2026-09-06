// @blinkbitcoin/kyc-react - public API.
//
// Plug-and-play identity verification for React web apps. The component is
// provider-agnostic: give it the VerificationSource for the mode you want.
//
//   // Hosted page (a page speaking the kyc-bridge protocol, in an iframe):
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

// The whole platform-agnostic core, re-exported for convenience - including
// the shared state machine, the bridge protocol, the Apollo-backed proxy
// source and the client factory. Unlike the React Native package there is no
// Apollo-free subpath: on the web there is no Metro export condition and no
// native peer to keep out of a build, so one entry plus "sideEffects": false
// lets a bundler drop whatever a hosted-only app never imports. This mirrors
// @blinkbitcoin/esign-react, which has no subpath either.
export * from '@blinkbitcoin/kyc-core';
