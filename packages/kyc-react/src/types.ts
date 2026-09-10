// Public type surface. Type-only by construction: nothing here emits code,
// which is why it is in coveragePathIgnorePatterns.

import type { CSSProperties } from 'react';
import type {
  VerificationLabels as CoreLabels,
  VerificationError,
  VerificationResult,
  VerificationSource,
  VerificationStatus,
  VerificationTheme,
} from '@blinkbitcoin/kyc-core/hosted';

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

/** Every styled element of the default Verification UI. */
export type VerificationStyleKey =
  | 'root'
  | 'embed'
  | 'hiddenEmbed'
  | 'actions'
  | 'screen'
  | 'title'
  | 'subtitle'
  | 'hint'
  | 'button'
  | 'secondaryButton'
  | 'spinner'
  | 'successText'
  | 'errorTitle';

/** Per-element style overrides; applied after the base styles and the theme. */
export type VerificationStyles = Partial<
  Record<VerificationStyleKey, CSSProperties>
>;

/** Copy overrides: the shared keys plus the one only this platform renders. */
export interface VerificationLabels extends CoreLabels {
  /** The browser-specific line under the permission message. */
  permissionHint?: string;
}

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
  /** Color and font overrides for the built-in screens. */
  theme?: VerificationTheme;
  /** Per-element style overrides (win over `theme`). */
  styles?: VerificationStyles;
  /** Copy overrides for the built-in screens (win over `label`). */
  labels?: VerificationLabels;
  /** How long the success screen shows before onComplete (default 1500ms). */
  successDelayMs?: number;
  /** Accessible name for the embedded page (default: "Identity verification"). */
  frameTitle?: string;
  /** Applied once, to the component's single root element. */
  style?: CSSProperties;
}
