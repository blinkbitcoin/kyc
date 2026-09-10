/**
 * theme resolvers - how a host's theme / styles / labels layer onto the
 * default web Verification look. Precedence: base < theme < styles[key].
 */

import { describeOutcome } from '@blinkbitcoin/kyc-core/hosted';

import {
  baseStyles,
  DEFAULT_LABELS,
  resolveLabels,
  resolveStyles,
} from '../theme';

import type { VerificationTheme } from '@blinkbitcoin/kyc-core/hosted';
import type { VerificationLabels, VerificationStyleKey } from '../types';

const STYLE_KEYS: VerificationStyleKey[] = [
  'root',
  'embed',
  'hiddenEmbed',
  'actions',
  'screen',
  'title',
  'subtitle',
  'hint',
  'button',
  'secondaryButton',
  'spinner',
  'successText',
  'errorTitle',
];

const FULL_THEME: Required<VerificationTheme> = {
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
    expect(resolveStyles()).toEqual(baseStyles);
  });

  it('keeps the default iOS blue on the buttons and the spinner', () => {
    const resolved = resolveStyles();
    expect(resolved.button.backgroundColor).toBe('#007AFF');
    expect(resolved.secondaryButton.color).toBe('#007AFF');
    expect(resolved.spinner.borderTopColor).toBe('#007AFF');
  });

  it.each([
    ['button', 'backgroundColor', FULL_THEME.primaryColor],
    ['button', 'color', FULL_THEME.primaryTextColor],
    ['secondaryButton', 'color', FULL_THEME.primaryColor],
    ['spinner', 'borderTopColor', FULL_THEME.primaryColor],
    ['title', 'color', FULL_THEME.textColor],
    ['subtitle', 'color', FULL_THEME.mutedTextColor],
    ['hint', 'color', FULL_THEME.mutedTextColor],
    ['successText', 'color', FULL_THEME.successColor],
    ['errorTitle', 'color', FULL_THEME.errorColor],
    ['screen', 'fontFamily', FULL_THEME.fontFamily],
  ] as const)('theme reaches %s.%s', (key, prop, expected) => {
    expect(resolveStyles(FULL_THEME)[key][prop]).toBe(expected);
  });

  it('a partial theme leaves the other values at their defaults', () => {
    const resolved = resolveStyles({ primaryColor: '#F7931A' });
    expect(resolved.button.backgroundColor).toBe('#F7931A');
    expect(resolved.button.color).toBe('#fff');
    expect(resolved.successText.color).toBe('#1E7E34');
    expect(resolved.screen.fontFamily).toBe('system-ui, sans-serif');
  });

  it('per-element styles win over the theme and apply to every key', () => {
    const overrides = Object.fromEntries(
      STYLE_KEYS.map(key => [key, { marginTop: 42 }]),
    );
    const resolved = resolveStyles(FULL_THEME, {
      ...overrides,
      button: { backgroundColor: '#ABCDEF', marginTop: 42 },
    });
    expect(resolved.button.backgroundColor).toBe('#ABCDEF');
    for (const key of STYLE_KEYS) {
      expect(resolved[key].marginTop).toBe(42);
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
    const all: Required<VerificationLabels> = {
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
      permissionHint: 'ph',
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
