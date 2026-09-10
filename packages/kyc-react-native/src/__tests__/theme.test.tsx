/**
 * theme resolvers - how a host's theme / styles / labels layer onto the
 * default IdentityVerification look. Precedence: base < theme < styles[key].
 */

import { StyleSheet } from 'react-native';
import { describeOutcome } from '@blinkbitcoin/kyc-core/hosted';

import {
  baseStyles,
  DEFAULT_LABELS,
  resolveLabels,
  resolveStyles,
} from '../theme';

import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { IdentityVerificationTheme } from '@blinkbitcoin/kyc-core/hosted';
import type {
  IdentityVerificationLabels,
  IdentityVerificationStyleKey,
} from '../types';

const flat = (style: StyleProp<ViewStyle | TextStyle>): TextStyle =>
  StyleSheet.flatten(style) as TextStyle;

const STYLE_KEYS: IdentityVerificationStyleKey[] = [
  'root',
  'screen',
  'page',
  'actions',
  'title',
  'subtitle',
  'button',
  'buttonText',
  'secondaryButton',
  'secondaryButtonText',
  'successText',
  'errorTitle',
  'hiddenWebView',
];

const FULL_THEME: Required<IdentityVerificationTheme> = {
  primaryColor: '#111111',
  primaryTextColor: '#222222',
  textColor: '#333333',
  mutedTextColor: '#444444',
  successColor: '#555555',
  errorColor: '#666666',
  fontFamily: 'Fira Sans',
};

describe('resolveStyles', () => {
  it('with no theme or styles resolves to the base styles for every key', () => {
    const resolved = resolveStyles();
    for (const key of STYLE_KEYS) {
      expect(flat(resolved[key])).toEqual(flat(baseStyles[key]));
    }
  });

  it('keeps the default iOS blue on the primary and secondary buttons', () => {
    const resolved = resolveStyles();
    expect(flat(resolved.button).backgroundColor).toBe('#007AFF');
    expect(flat(resolved.secondaryButtonText).color).toBe('#007AFF');
  });

  it.each([
    ['button', 'backgroundColor', FULL_THEME.primaryColor],
    ['secondaryButtonText', 'color', FULL_THEME.primaryColor],
    ['buttonText', 'color', FULL_THEME.primaryTextColor],
    ['title', 'color', FULL_THEME.textColor],
    ['subtitle', 'color', FULL_THEME.mutedTextColor],
    ['successText', 'color', FULL_THEME.successColor],
    ['errorTitle', 'color', FULL_THEME.errorColor],
  ] as const)('theme colors %s.%s', (key, prop, expected) => {
    const resolved = resolveStyles(FULL_THEME);
    expect(flat(resolved[key])[prop]).toBe(expected);
  });

  it('the theme font reaches every text element', () => {
    const resolved = resolveStyles(FULL_THEME);
    for (const key of [
      'title',
      'subtitle',
      'buttonText',
      'secondaryButtonText',
      'successText',
      'errorTitle',
    ] as const) {
      expect(flat(resolved[key]).fontFamily).toBe('Fira Sans');
    }
  });

  it('a partial theme leaves the other colors at their defaults', () => {
    const resolved = resolveStyles({ primaryColor: '#F7931A' });
    expect(flat(resolved.button).backgroundColor).toBe('#F7931A');
    expect(flat(resolved.buttonText).color).toBe('#fff');
    expect(flat(resolved.successText).color).toBe('#1E7E34');
    expect(flat(resolved.title).fontFamily).toBeUndefined();
  });

  it('per-element styles win over the theme and apply to every key', () => {
    const overrides = Object.fromEntries(
      STYLE_KEYS.map(key => [key, { marginTop: 42 }]),
    );
    const resolved = resolveStyles(FULL_THEME, {
      ...overrides,
      button: { backgroundColor: '#ABCDEF', marginTop: 42 },
    });
    expect(flat(resolved.button).backgroundColor).toBe('#ABCDEF');
    for (const key of STYLE_KEYS) {
      expect(flat(resolved[key]).marginTop).toBe(42);
    }
  });
});

describe('resolveLabels', () => {
  it('uses the defaults with label as title and start', () => {
    expect(resolveLabels('Verify identity')).toEqual({
      ...DEFAULT_LABELS,
      title: 'Verify identity',
      start: 'Verify identity',
      errorMessages: {},
    });
  });

  it('defaults the outcome copy to describeOutcome', () => {
    expect(DEFAULT_LABELS.outcomeApproved).toBe(describeOutcome('approved'));
    expect(DEFAULT_LABELS.outcomeReviewing).toBe(describeOutcome(undefined));
  });

  it('every key can be overridden', () => {
    const all: Required<IdentityVerificationLabels> = {
      title: 't',
      subtitle: 'st',
      start: 's',
      cancel: 'c',
      loading: 'l',
      inProgressTitle: 'ipt',
      inProgressSubtitle: 'ips',
      pendingTitle: 'pt',
      permissionTitle: 'pmt',
      permissionMessage: 'pmm',
      openSettings: 'os',
      retry: 'r',
      restart: 'rs',
      offlineTitle: 'ot',
      offlineMessage: 'om',
      checkConnection: 'cc',
      errorTitle: 'et',
      outcomeApproved: 'oa',
      outcomeDeclined: 'od',
      outcomeFinallyRejected: 'of',
      outcomeIncomplete: 'oi',
      outcomeReviewing: 'or',
      errorMessages: { NETWORK_ERROR: 'ne' },
    };
    expect(resolveLabels('ignored', all)).toEqual(all);
  });

  it('an explicit undefined keeps the default rather than blanking it', () => {
    const resolved = resolveLabels('Verify', {
      cancel: undefined,
      retry: 'Again',
    });
    expect(resolved.cancel).toBe('Cancel');
    expect(resolved.retry).toBe('Again');
    expect(resolved.title).toBe('Verify');
  });
});
