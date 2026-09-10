// Copy resolution for the default Verification UI: how a host's labels layer
// onto a platform's defaults, and how the outcome and error copy fall back
// to the built-in messages.

import { getErrorMessage } from '../messages';
import { describeOutcome } from '../machine';
import {
  DEFAULT_OUTCOME_LABELS,
  failureLabel,
  outcomeLabel,
  resolveLabelsWith,
} from '../labels';

import type { LabelDefaults, VerificationLabels } from '../labels';

interface PlatformLabels extends VerificationLabels {
  /** A platform-only key, like the RN "Open settings" button. */
  extra?: string;
}

const DEFAULTS: LabelDefaults<PlatformLabels> = {
  subtitle: 'Have your ID ready.',
  cancel: 'Cancel',
  loading: 'Preparing...',
  inProgressTitle: 'In progress',
  inProgressSubtitle: 'Follow the steps.',
  pendingTitle: 'Thanks',
  permissionTitle: 'Camera access needed',
  permissionMessage: getErrorMessage('PERMISSION_DENIED'),
  retry: 'Try again',
  restart: 'Restart',
  offlineTitle: 'No connection',
  offlineMessage: 'A connection is required.',
  checkConnection: 'Check connection',
  errorTitle: 'Verification failed',
  ...DEFAULT_OUTCOME_LABELS,
  extra: 'Open settings',
};

describe('resolveLabelsWith', () => {
  it('uses the defaults with label as the title and the start button', () => {
    expect(resolveLabelsWith(DEFAULTS, 'Verify identity')).toEqual({
      ...DEFAULTS,
      title: 'Verify identity',
      start: 'Verify identity',
      errorMessages: {},
    });
  });

  it('every key can be overridden, the platform key included', () => {
    const all: Required<PlatformLabels> = {
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
      extra: 'x',
    };
    expect(resolveLabelsWith(DEFAULTS, 'ignored', all)).toEqual(all);
  });

  it('an explicit undefined keeps the default rather than blanking it', () => {
    const resolved = resolveLabelsWith(DEFAULTS, 'Verify', {
      cancel: undefined,
      retry: 'Again',
      errorMessages: { NETWORK_ERROR: undefined, TOKEN_EXPIRED: 'Expired' },
    });
    expect(resolved.cancel).toBe('Cancel');
    expect(resolved.retry).toBe('Again');
    expect(resolved.title).toBe('Verify');
    expect(resolved.errorMessages).toEqual({ TOKEN_EXPIRED: 'Expired' });
  });
});

describe('DEFAULT_OUTCOME_LABELS', () => {
  it('is describeOutcome, one key per outcome the pending screen can show', () => {
    expect(DEFAULT_OUTCOME_LABELS).toEqual({
      outcomeApproved: describeOutcome('approved'),
      outcomeDeclined: describeOutcome('declined'),
      outcomeFinallyRejected: describeOutcome('finallyRejected'),
      outcomeIncomplete: describeOutcome('incomplete'),
      outcomeReviewing: describeOutcome(undefined),
    });
  });
});

describe('outcomeLabel', () => {
  const labels = resolveLabelsWith(DEFAULTS, 'Verify', {
    outcomeDeclined: 'Nope',
  });

  it.each([
    ['approved', DEFAULT_OUTCOME_LABELS.outcomeApproved],
    ['declined', 'Nope'],
    ['finallyRejected', DEFAULT_OUTCOME_LABELS.outcomeFinallyRejected],
    ['incomplete', DEFAULT_OUTCOME_LABELS.outcomeIncomplete],
  ] as const)('%s reads its key', (status, expected) => {
    expect(outcomeLabel(labels, status)).toBe(expected);
  });

  it.each(['initial', 'pending', undefined] as const)(
    'anything without a decision (%s) is "reviewing"',
    status => {
      expect(outcomeLabel(labels, status)).toBe(
        DEFAULT_OUTCOME_LABELS.outcomeReviewing,
      );
    },
  );
});

describe('failureLabel', () => {
  it("is the host's copy for the code when there is one, else the error's own message", () => {
    const labels = resolveLabelsWith(DEFAULTS, 'Verify', {
      errorMessages: { NETWORK_ERROR: 'Offline?' },
    });
    expect(
      failureLabel(labels, { code: 'NETWORK_ERROR', message: 'built-in' }),
    ).toBe('Offline?');
    expect(
      failureLabel(labels, { code: 'TOKEN_EXPIRED', message: 'built-in' }),
    ).toBe('built-in');
  });
});
