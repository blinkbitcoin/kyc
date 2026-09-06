// Public type surface. Type-only by construction: nothing here emits code,
// which is why it is in coveragePathIgnorePatterns.

import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type {
  VerificationResult,
  VerificationSource,
  VerificationStatus,
} from '@blinkbitcoin/kyc-core/hosted';
import type { CheckPermissions } from './useVerification';
import type { VerificationError } from './verificationMachine';

export type {
  MachineAction,
  MachineState,
  PermissionReason,
  VerificationEffect,
  VerificationError,
  VerificationPlan,
  VerificationState,
} from './verificationMachine';
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
