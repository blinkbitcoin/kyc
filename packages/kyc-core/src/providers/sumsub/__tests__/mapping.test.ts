import {
  mapSumsubStatus,
  mapSumsubWebhookStatus,
  mapSumsubWebhookType,
  SUMSUB_WEBHOOK_TYPES,
} from '../mapping';
import {
  SUMSUB_REJECT_TYPES,
  SUMSUB_REVIEW_ANSWERS,
  SUMSUB_REVIEW_STATUSES,
} from '../types';

import type { SumsubWebhookPayload } from '../types';

describe('the Sumsub vocabulary', () => {
  it('lists the review statuses, answers and reject types the API documents', () => {
    expect(SUMSUB_REVIEW_STATUSES).toEqual([
      'init',
      'pending',
      'prechecked',
      'queued',
      'completed',
      'onHold',
    ]);
    expect(SUMSUB_REVIEW_ANSWERS).toEqual(['GREEN', 'RED']);
    expect(SUMSUB_REJECT_TYPES).toEqual(['FINAL', 'RETRY']);
  });
});

describe('mapSumsubStatus', () => {
  it('maps a completed GREEN review to approved', () => {
    expect(mapSumsubStatus('completed', { reviewAnswer: 'GREEN' })).toBe(
      'approved',
    );
  });

  it('maps a completed RED FINAL review to finallyRejected', () => {
    expect(
      mapSumsubStatus('completed', {
        reviewAnswer: 'RED',
        reviewRejectType: 'FINAL',
      }),
    ).toBe('finallyRejected');
  });

  it('maps a completed RED RETRY review to declined (the applicant may resubmit)', () => {
    expect(
      mapSumsubStatus('completed', {
        reviewAnswer: 'RED',
        reviewRejectType: 'RETRY',
      }),
    ).toBe('declined');
  });

  it('treats a RED review with no reject type as a retryable decline', () => {
    expect(mapSumsubStatus('completed', { reviewAnswer: 'RED' })).toBe(
      'declined',
    );
  });

  it('treats a completed review with no result as still under review', () => {
    expect(mapSumsubStatus('completed')).toBe('pending');
    expect(mapSumsubStatus('completed', {})).toBe('pending');
  });

  it.each(['pending', 'queued', 'prechecked', 'onHold'])(
    'maps %s to pending',
    reviewStatus => {
      expect(mapSumsubStatus(reviewStatus)).toBe('pending');
    },
  );

  it('maps init to incomplete', () => {
    expect(mapSumsubStatus('init')).toBe('incomplete');
  });

  it('maps an unknown or absent review status to initial', () => {
    expect(mapSumsubStatus('somethingNew')).toBe('initial');
    expect(mapSumsubStatus(undefined)).toBe('initial');
  });

  it('never leaves the normalized vocabulary for any documented combination', () => {
    const allowed = [
      'initial',
      'incomplete',
      'pending',
      'approved',
      'declined',
      'finallyRejected',
    ];
    for (const reviewStatus of SUMSUB_REVIEW_STATUSES) {
      for (const reviewAnswer of [undefined, ...SUMSUB_REVIEW_ANSWERS]) {
        for (const reviewRejectType of [undefined, ...SUMSUB_REJECT_TYPES]) {
          expect(allowed).toContain(
            mapSumsubStatus(
              reviewStatus,
              reviewAnswer ? { reviewAnswer, reviewRejectType } : undefined,
            ),
          );
        }
      }
    }
  });
});

describe('mapSumsubWebhookType', () => {
  it('routes applicantReviewed through the review result', () => {
    expect(
      mapSumsubWebhookType('applicantReviewed', 'completed', {
        reviewAnswer: 'GREEN',
      }),
    ).toBe('approved');
  });

  it('maps the lifecycle events without consulting the review result', () => {
    expect(mapSumsubWebhookType('applicantCreated')).toBe('incomplete');
    expect(mapSumsubWebhookType('applicantPending')).toBe('pending');
    expect(mapSumsubWebhookType('applicantOnHold')).toBe('pending');
    expect(mapSumsubWebhookType('applicantReset')).toBe('initial');
  });

  it('returns null for an event we do not act on', () => {
    expect(mapSumsubWebhookType('applicantWorkflowCompleted')).toBeNull();
  });

  it('exposes the lifecycle table it reads', () => {
    expect(SUMSUB_WEBHOOK_TYPES).toEqual({
      applicantCreated: 'incomplete',
      applicantPending: 'pending',
      applicantOnHold: 'pending',
      applicantReset: 'initial',
    });
  });
});

describe('mapSumsubWebhookStatus', () => {
  const payload = (
    over: Partial<SumsubWebhookPayload>,
  ): SumsubWebhookPayload => ({
    type: 'applicantReviewed',
    applicantId: 'a1',
    ...over,
  });

  it('maps applicantReviewed through the review result', () => {
    expect(
      mapSumsubWebhookStatus(
        payload({
          reviewStatus: 'completed',
          reviewResult: { reviewAnswer: 'GREEN' },
        }),
      ),
    ).toBe('approved');
  });

  it('maps the lifecycle events', () => {
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantCreated' }))).toBe(
      'incomplete',
    );
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantPending' }))).toBe(
      'pending',
    );
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantOnHold' }))).toBe(
      'pending',
    );
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantReset' }))).toBe(
      'initial',
    );
  });

  it('returns null for an event we do not act on', () => {
    expect(
      mapSumsubWebhookStatus(payload({ type: 'applicantWorkflowCompleted' })),
    ).toBeNull();
  });
});
