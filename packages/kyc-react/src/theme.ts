// Look of the default web Verification UI: base styles, default copy, and
// the resolvers that layer a host's theme / styles / labels on top.
// Precedence: base style < theme-derived color < styles[key].
// Mirrors the React Native component's StyleSheet (WCAG AA colors).

import {
  DEFAULT_OUTCOME_LABELS,
  getErrorMessage,
  resolveLabelsWith,
} from '@blinkbitcoin/kyc-core/hosted';

import type { CSSProperties } from 'react';
import type {
  LabelDefaults,
  ResolvedLabels,
  VerificationTheme,
} from '@blinkbitcoin/kyc-core/hosted';
import type {
  VerificationLabels,
  VerificationStyleKey,
  VerificationStyles,
} from './types';

export const baseStyles: Record<VerificationStyleKey, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', width: '100%' },
  embed: { display: 'block', width: '100%', flex: 1 },
  // Keeps the page's bridge alive under the pending overlay without showing
  // the (already-submitted) hosted page. See the note at the call site for
  // why `display` is set explicitly.
  hiddenEmbed: {
    display: 'block',
    width: 0,
    height: 0,
    overflow: 'hidden',
    visibility: 'hidden',
  },
  actions: { display: 'flex', justifyContent: 'center', padding: '12px 0' },
  screen: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    fontFamily: 'system-ui, sans-serif',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    margin: '0 0 10px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    margin: '0 0 20px',
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: '#888',
    margin: '0 0 20px',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    padding: '12px 30px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    marginBottom: 10,
  },
  secondaryButton: {
    background: 'none',
    color: '#007AFF',
    fontSize: 16,
    padding: '12px 30px',
    border: 'none',
    cursor: 'pointer',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '4px solid #ddd',
    borderTopColor: '#007AFF',
    borderRadius: '50%',
    marginBottom: 10,
  },
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
    margin: '0 0 10px',
  },
};

/** Copy of the built-in screens; `title` and `start` come from `label`. */
export const DEFAULT_LABELS: LabelDefaults<VerificationLabels> = {
  subtitle: 'Have your ID document ready and allow camera access.',
  cancel: 'Cancel',
  loading: 'Preparing verification...',
  inProgressTitle: 'Verification in progress',
  inProgressSubtitle: 'Follow the steps in the verification window.',
  pendingTitle: 'Thanks',
  permissionTitle: 'Camera access needed',
  permissionMessage: getErrorMessage('PERMISSION_DENIED'),
  permissionHint:
    'Allow camera access for this site in your browser, then try again.',
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
  labels?: VerificationLabels,
): ResolvedLabels<VerificationLabels> =>
  resolveLabelsWith(DEFAULT_LABELS, label, labels);

export type ResolvedStyles = Record<VerificationStyleKey, CSSProperties>;

const color = (value?: string): CSSProperties | undefined =>
  value != null ? { color: value } : undefined;
const font = (value?: string): CSSProperties | undefined =>
  value != null ? { fontFamily: value } : undefined;

/** Base styles, then theme colors, then per-element overrides. */
export const resolveStyles = (
  theme?: VerificationTheme,
  styles?: VerificationStyles,
): ResolvedStyles => ({
  root: { ...baseStyles.root, ...styles?.root },
  embed: { ...baseStyles.embed, ...styles?.embed },
  hiddenEmbed: { ...baseStyles.hiddenEmbed, ...styles?.hiddenEmbed },
  actions: { ...baseStyles.actions, ...styles?.actions },
  screen: {
    ...baseStyles.screen,
    ...font(theme?.fontFamily),
    ...styles?.screen,
  },
  title: { ...baseStyles.title, ...color(theme?.textColor), ...styles?.title },
  subtitle: {
    ...baseStyles.subtitle,
    ...color(theme?.mutedTextColor),
    ...styles?.subtitle,
  },
  hint: {
    ...baseStyles.hint,
    ...color(theme?.mutedTextColor),
    ...styles?.hint,
  },
  button: {
    ...baseStyles.button,
    ...(theme?.primaryColor != null && {
      backgroundColor: theme.primaryColor,
    }),
    ...color(theme?.primaryTextColor),
    ...styles?.button,
  },
  secondaryButton: {
    ...baseStyles.secondaryButton,
    ...color(theme?.primaryColor),
    ...styles?.secondaryButton,
  },
  spinner: {
    ...baseStyles.spinner,
    ...(theme?.primaryColor != null && {
      borderTopColor: theme.primaryColor,
    }),
    ...styles?.spinner,
  },
  successText: {
    ...baseStyles.successText,
    ...color(theme?.successColor),
    ...styles?.successText,
  },
  errorTitle: {
    ...baseStyles.errorTitle,
    ...color(theme?.errorColor),
    ...styles?.errorTitle,
  },
});
