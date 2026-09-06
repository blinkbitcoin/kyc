// Public type surface. Type-only by construction: nothing here emits code,
// which is why it is in coveragePathIgnorePatterns.

import type { CSSProperties } from 'react';
import type {
  VerificationError,
  VerificationResult,
  VerificationSource,
  VerificationStatus,
} from '@blinkbitcoin/kyc-core';

export type { MountableSource } from './mountable';
export type { MountPointProps } from './MountPoint';
export type { TokenPostable, UseTokenRefreshOptions } from './useTokenRefresh';
export type {
  UseVerification,
  UseVerificationOptions,
} from './useVerification';
export type { HostedFrameProps } from './hosted/HostedFrame';
export type {
  GuardableMessage,
  HardenedFrameProps,
  HostedFrameOptions,
  MessageGuardOptions,
} from './hosted/frameProps';

/**
 * Props for the default Verification UI. The component is provider-agnostic:
 * give it the source for the mode you want (createHostedSource,
 * createProxySource, or a MountableSource from a provider web-SDK adapter)
 * and it does the rest.
 */
export interface VerificationProps {
  source: VerificationSource;
  onComplete: (result: VerificationResult) => void;
  onError: (error: VerificationError) => void;
  onCancel: () => void;
  /** Every intermediate status the provider reports. */
  onStatusChange?: (status: VerificationStatus) => void;
  /** Idle-screen title and button label (default: "Verify identity"). */
  label?: string;
  /** How long the success screen shows before onComplete (default 1500ms). */
  successDelayMs?: number;
  /** Accessible name for the embedded page (default: "Identity verification"). */
  frameTitle?: string;
  /** Applied once, to the component's single root element. */
  style?: CSSProperties;
}
