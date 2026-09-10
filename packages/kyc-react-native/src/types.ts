// Public type surface. Type-only by construction: nothing here emits code,
// which is why it is in coveragePathIgnorePatterns.

import type { ReactElement } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type {
  IdentityVerificationLabels as CoreLabels,
  IdentityVerificationError,
  IdentityVerificationResult,
  VerificationSource,
  IdentityVerificationStatus,
  IdentityVerificationTheme,
} from '@blinkbitcoin/kyc-core/hosted';
import type { CheckPermissions } from './useIdentityVerification';

export type {
  CheckPermissions,
  PermissionState,
  UseIdentityVerification,
  UseIdentityVerificationOptions,
} from './useIdentityVerification';
export type {
  TokenInjectable,
  UseTokenRefreshOptions,
} from './useTokenRefresh';
export type { HostedWebViewProps } from './hosted/HostedWebView';
export type {
  HardenedWebViewProps,
  HostedWebViewOptions,
  MediaCapturePermissionGrantType,
  NavigationRequest,
} from './hosted/webViewProps';

/** Every styled element of the default IdentityVerification UI. */
export type IdentityVerificationStyleKey =
  | 'root'
  | 'screen'
  | 'page'
  | 'actions'
  | 'title'
  | 'subtitle'
  | 'button'
  | 'buttonText'
  | 'secondaryButton'
  | 'secondaryButtonText'
  | 'successText'
  | 'errorTitle'
  | 'hiddenWebView';

/** Per-element style overrides; applied after the base styles and the theme. */
export type IdentityVerificationStyles = Partial<
  Record<IdentityVerificationStyleKey, StyleProp<ViewStyle | TextStyle>>
>;

/** Copy overrides: the shared keys plus the one only this platform renders. */
export interface IdentityVerificationLabels extends CoreLabels {
  /** The settings button on the permission screen (`onOpenSettings`). */
  openSettings?: string;
}

/**
 * Props for the default IdentityVerification UI. The component is provider-agnostic:
 * give it the source for the mode you want (createSumsubNativeSource,
 * createHostedSource, createProxySource) and it does the rest.
 */
export interface IdentityVerificationProps {
  source: VerificationSource;
  onComplete: (result: IdentityVerificationResult) => void;
  onError: (error: IdentityVerificationError) => void;
  onCancel: () => void;
  /** Every intermediate status the provider reports. */
  onStatusChange?: (status: IdentityVerificationStatus) => void;
  /** Idle-screen title and button label (default: "Verify identity"). */
  label?: string;
  /** Color and font overrides for the built-in screens. */
  theme?: IdentityVerificationTheme;
  /** Per-element style overrides (win over `theme`). */
  styles?: IdentityVerificationStyles;
  /** Copy overrides for the built-in screens (win over `label`). */
  labels?: IdentityVerificationLabels;
  /** How long the success screen shows before onComplete (default 1500ms). */
  successDelayMs?: number;
  /** Preflight the camera with the host's own permission library. */
  checkPermissions?: CheckPermissions;
  /** Shown as "Open settings" on the permissionDenied screen when provided. */
  onOpenSettings?: () => void;
  /** Extra origins the hosted page may navigate to (provider frames). */
  allowedNavigationOrigins?: string[];
  /** Custom loading view inside the WebView while the page loads. */
  renderLoading?: () => ReactElement;
  style?: StyleProp<ViewStyle>;
}
