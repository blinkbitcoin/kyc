// Public type surface. Type-only by construction: nothing here emits code,
// which is why it is in coveragePathIgnorePatterns.

import type { ReactElement } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type {
  VerificationLabels as CoreLabels,
  VerificationError,
  VerificationResult,
  VerificationSource,
  VerificationStatus,
  VerificationTheme,
} from '@blinkbitcoin/kyc-core/hosted';
import type { CheckPermissions } from './useVerification';

export type {
  CheckPermissions,
  PermissionState,
  UseVerification,
  UseVerificationOptions,
} from './useVerification';
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

/** Every styled element of the default Verification UI. */
export type VerificationStyleKey =
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
export type VerificationStyles = Partial<
  Record<VerificationStyleKey, StyleProp<ViewStyle | TextStyle>>
>;

/** Copy overrides: the shared keys plus the one only this platform renders. */
export interface VerificationLabels extends CoreLabels {
  /** The settings button on the permission screen (`onOpenSettings`). */
  openSettings?: string;
}

/**
 * Props for the default Verification UI. The component is provider-agnostic:
 * give it the source for the mode you want (createSumsubNativeSource,
 * createHostedSource, createProxySource) and it does the rest.
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
