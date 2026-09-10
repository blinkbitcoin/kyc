// Look of the default IdentityVerification UI: base styles, default copy, and the
// resolvers that layer a host's theme / styles / labels on top.
// Precedence: base style < theme-derived color < styles[key].

import { resolveLabelsWith } from '@blinkbitcoin/kyc-core/hosted';
import { DEFAULT_OUTCOME_LABELS } from '@blinkbitcoin/kyc-core/hosted';
import { getErrorMessage } from '@blinkbitcoin/kyc-core/hosted';
import { StyleSheet } from 'react-native';

import type {
  LabelDefaults,
  ResolvedLabels,
} from '@blinkbitcoin/kyc-core/hosted';
import type { IdentityVerificationTheme } from '@blinkbitcoin/kyc-core/hosted';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type {
  IdentityVerificationLabels,
  IdentityVerificationStyleKey,
  IdentityVerificationStyles,
} from './types';

export const baseStyles = StyleSheet.create({
  root: { flex: 1 },
  screen: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: { flex: 1, width: '100%' },
  actions: { alignItems: 'center', paddingVertical: 12 },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { paddingHorizontal: 30, paddingVertical: 12 },
  secondaryButtonText: { color: '#007AFF', fontSize: 16 },
  // Darker green / red for WCAG AA contrast (4.5:1)
  successText: {
    fontSize: 20,
    color: '#1E7E34',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 20,
    color: '#C82333',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  // Keeps the page's bridge alive under the pending overlay without showing
  // the (already-submitted) hosted page.
  hiddenWebView: { position: 'absolute', width: 0, height: 0, opacity: 0 },
});

/** Copy of the built-in screens; `title` and `start` come from `label`. */
export const DEFAULT_LABELS: LabelDefaults<IdentityVerificationLabels> = {
  subtitle: 'Have your ID document ready and allow camera access.',
  cancel: 'Cancel',
  loading: 'Preparing verification...',
  inProgressTitle: 'Verification in progress',
  inProgressSubtitle: 'Follow the steps in the verification screen.',
  pendingTitle: 'Thanks',
  permissionTitle: 'Camera access needed',
  permissionMessage: getErrorMessage('PERMISSION_DENIED'),
  openSettings: 'Open settings',
  retry: 'Try again',
  restart: 'Restart',
  offlineTitle: 'No connection',
  offlineMessage: 'A connection is required to verify your identity.',
  checkConnection: 'Check connection',
  errorTitle: 'Verification failed',
  ...DEFAULT_OUTCOME_LABELS,
};

/** Defaults, then `label` for title/start, then any explicit overrides. */
export const resolveLabels = (
  label: string,
  labels?: IdentityVerificationLabels,
): ResolvedLabels<IdentityVerificationLabels> =>
  resolveLabelsWith(DEFAULT_LABELS, label, labels);

export type ResolvedStyles = Record<
  IdentityVerificationStyleKey,
  StyleProp<ViewStyle | TextStyle>
>;

const color = (value?: string): TextStyle | undefined =>
  value != null ? { color: value } : undefined;
const background = (value?: string): ViewStyle | undefined =>
  value != null ? { backgroundColor: value } : undefined;
const font = (value?: string): TextStyle | undefined =>
  value != null ? { fontFamily: value } : undefined;

/** Base styles, then theme colors, then per-element overrides. */
export const resolveStyles = (
  theme?: IdentityVerificationTheme,
  styles?: IdentityVerificationStyles,
): ResolvedStyles => ({
  root: [baseStyles.root, styles?.root],
  screen: [baseStyles.screen, styles?.screen],
  page: [baseStyles.page, styles?.page],
  actions: [baseStyles.actions, styles?.actions],
  title: [
    baseStyles.title,
    color(theme?.textColor),
    font(theme?.fontFamily),
    styles?.title,
  ],
  subtitle: [
    baseStyles.subtitle,
    color(theme?.mutedTextColor),
    font(theme?.fontFamily),
    styles?.subtitle,
  ],
  button: [baseStyles.button, background(theme?.primaryColor), styles?.button],
  buttonText: [
    baseStyles.buttonText,
    color(theme?.primaryTextColor),
    font(theme?.fontFamily),
    styles?.buttonText,
  ],
  secondaryButton: [baseStyles.secondaryButton, styles?.secondaryButton],
  secondaryButtonText: [
    baseStyles.secondaryButtonText,
    color(theme?.primaryColor),
    font(theme?.fontFamily),
    styles?.secondaryButtonText,
  ],
  successText: [
    baseStyles.successText,
    color(theme?.successColor),
    font(theme?.fontFamily),
    styles?.successText,
  ],
  errorTitle: [
    baseStyles.errorTitle,
    color(theme?.errorColor),
    font(theme?.fontFamily),
    styles?.errorTitle,
  ],
  hiddenWebView: [baseStyles.hiddenWebView, styles?.hiddenWebView],
});
