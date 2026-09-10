// The ./sumsub entry's surface (src/sumsub.ts re-exports this file).
//
// RESERVED for the Sumsub web-SDK adapter. v1 deliberately ships none: the
// Sumsub web SDK is itself an iframe, so the hosted page already covers the
// browser, and MountableSource has no second implementer to justify the
// @sumsub/websdk peer. The follow-up lands here without a breaking change:
// createSumsubWebSource implementing MountableSource over
// snsWebSdk.init(token, expirationHandler)...launch(container), with the
// message handler wired to interpretSumsubWebMessage.
//
// Until then this entry is core's Sumsub surface (the mapping, so a host
// that mounts the web SDK itself can normalize its events today) plus the
// component, the hook and the mountable seam - Apollo-free like ./hosted,
// since the component modules import core's hosted entry (guard-tested).
//
//   import { Verification, interpretSumsubWebMessage } from '@blinkbitcoin/kyc-react/sumsub';

export * from '@blinkbitcoin/kyc-core/sumsub';
export { Verification, DEFAULT_LABEL } from '../../Verification';
export {
  useVerification,
  DEFAULT_SUCCESS_DELAY_MS,
} from '../../useVerification';
export { useTokenRefresh } from '../../useTokenRefresh';
export { MountPoint, MOUNT_POINT_TEST_ID } from '../../MountPoint';
export { isMountable } from '../../mountable';
export type * from '../../types';
export type { VerificationLabels } from '../../types';
export {
  baseStyles,
  DEFAULT_LABELS,
  resolveLabels,
  resolveStyles,
} from '../../theme';
