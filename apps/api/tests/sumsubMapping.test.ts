import type { SumsubWebhookPayload } from '../src/providers/sumsub/mapping';
import { mapSumsubStatus, mapSumsubWebhookStatus } from '../src/providers/sumsub/mapping';

describe('mapSumsubStatus', () => {
  it('maps a completed GREEN review to approved', () => {
    expect(mapSumsubStatus('completed', { reviewAnswer: 'GREEN' })).toBe('approved');
  });

  it('maps a completed RED FINAL review to finallyRejected', () => {
    expect(mapSumsubStatus('completed', { reviewAnswer: 'RED', reviewRejectType: 'FINAL' })).toBe(
      'finallyRejected'
    );
  });

  it('maps a completed RED RETRY review to declined (the applicant may resubmit)', () => {
    expect(mapSumsubStatus('completed', { reviewAnswer: 'RED', reviewRejectType: 'RETRY' })).toBe(
      'declined'
    );
  });

  it('treats a RED review with no reject type as a retryable decline', () => {
    expect(mapSumsubStatus('completed', { reviewAnswer: 'RED' })).toBe('declined');
  });

  it('treats a completed review with no result as still under review', () => {
    expect(mapSumsubStatus('completed')).toBe('pending');
    expect(mapSumsubStatus('completed', {})).toBe('pending');
  });

  it.each(['pending', 'queued', 'prechecked', 'onHold'])('maps %s to pending', (reviewStatus) => {
    expect(mapSumsubStatus(reviewStatus)).toBe('pending');
  });

  it('maps init to incomplete', () => {
    expect(mapSumsubStatus('init')).toBe('incomplete');
  });

  it('maps an unknown or absent review status to initial', () => {
    expect(mapSumsubStatus('somethingNew')).toBe('initial');
    expect(mapSumsubStatus(undefined)).toBe('initial');
  });
});

describe('mapSumsubWebhookStatus', () => {
  const payload = (over: Partial<SumsubWebhookPayload>): SumsubWebhookPayload => ({
    type: 'applicantReviewed',
    applicantId: 'a1',
    ...over,
  });

  it('maps applicantReviewed through the review result', () => {
    expect(
      mapSumsubWebhookStatus(
        payload({ reviewStatus: 'completed', reviewResult: { reviewAnswer: 'GREEN' } })
      )
    ).toBe('approved');
  });

  it('maps the lifecycle events without consulting the review result', () => {
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantCreated' }))).toBe('incomplete');
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantPending' }))).toBe('pending');
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantOnHold' }))).toBe('pending');
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantReset' }))).toBe('initial');
  });

  it('returns null for an event we do not act on', () => {
    expect(mapSumsubWebhookStatus(payload({ type: 'applicantWorkflowCompleted' }))).toBeNull();
  });
});
