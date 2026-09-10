// @blinkbitcoin/kyc-react/hosted - the Apollo-free entry.
//
// For apps that only run the hosted-page mode (or mount a provider web SDK
// themselves): nothing reachable from this file imports '@apollo/client'
// or 'graphql', so those optional peers never need to be installed - the
// same contract as @blinkbitcoin/kyc-react-native/hosted, so a host that
// ships both platforms writes the same import on both. Enforced by
// src/__tests__/hosted-entry.test.ts and by scripts/pack-smoke.sh.
// Proxy-mode apps import the package root instead.
//
//   import { IdentityVerification, createHostedSource } from '@blinkbitcoin/kyc-react/hosted';

export { IdentityVerification, DEFAULT_LABEL } from './IdentityVerification';
export {
  useIdentityVerification,
  DEFAULT_SUCCESS_DELAY_MS,
} from './useIdentityVerification';
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
export type { IdentityVerificationLabels } from './types';
export {
  baseStyles,
  DEFAULT_LABELS,
  resolveLabels,
  resolveStyles,
} from './theme';

export * from '@blinkbitcoin/kyc-core/hosted';
