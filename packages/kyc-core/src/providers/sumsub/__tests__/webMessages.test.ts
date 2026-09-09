import {
  interpretSumsubWebMessage,
  SUMSUB_ERROR_CODE,
  SUMSUB_EVENT_NAMES,
} from '../mapping';

describe('SUMSUB_EVENT_NAMES', () => {
  it('lists the idCheck messages this version understands', () => {
    expect(SUMSUB_EVENT_NAMES).toEqual([
      'idCheck.onApplicantLoaded',
      'idCheck.onApplicantSubmitted',
      'idCheck.onApplicantResubmitted',
      'idCheck.onApplicantStatusChanged',
      'idCheck.onError',
    ]);
  });
});

describe('interpretSumsubWebMessage', () => {
  it('maps onApplicantLoaded with its applicant id', () => {
    expect(
      interpretSumsubWebMessage('idCheck.onApplicantLoaded', {
        applicantId: 'a-1',
      }),
    ).toEqual({ type: 'applicantLoaded', applicantId: 'a-1' });
  });

  it('drops onApplicantLoaded without a usable applicant id', () => {
    expect(
      interpretSumsubWebMessage('idCheck.onApplicantLoaded', {}),
    ).toBeNull();
    expect(
      interpretSumsubWebMessage('idCheck.onApplicantLoaded', {
        applicantId: 7,
      }),
    ).toBeNull();
    expect(
      interpretSumsubWebMessage('idCheck.onApplicantLoaded', null),
    ).toBeNull();
  });

  it('maps both submission messages to submitted', () => {
    expect(
      interpretSumsubWebMessage('idCheck.onApplicantSubmitted', {}),
    ).toEqual({
      type: 'submitted',
    });
    expect(
      interpretSumsubWebMessage('idCheck.onApplicantResubmitted', undefined),
    ).toEqual({ type: 'submitted' });
  });

  it('maps onApplicantStatusChanged through the shared status table', () => {
    expect(
      interpretSumsubWebMessage('idCheck.onApplicantStatusChanged', {
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL' },
        levelName: 'basic-kyc-level',
      }),
    ).toEqual({ type: 'statusChanged', status: 'finallyRejected' });
  });

  it('falls back to initial for a status change it cannot read', () => {
    expect(
      interpretSumsubWebMessage('idCheck.onApplicantStatusChanged', {
        reviewStatus: 42,
      }),
    ).toEqual({ type: 'statusChanged', status: 'initial' });
  });

  it('maps onError with the page code and reason', () => {
    expect(
      interpretSumsubWebMessage('idCheck.onError', {
        code: 'PERMISSION_DENIED',
        reason: 'no camera',
      }),
    ).toEqual({
      type: 'error',
      code: 'PERMISSION_DENIED',
      message: 'no camera',
    });
  });

  it('falls back to the package error code and omits a missing reason', () => {
    expect(interpretSumsubWebMessage('idCheck.onError', {})).toEqual({
      type: 'error',
      code: SUMSUB_ERROR_CODE,
    });
    expect(SUMSUB_ERROR_CODE).toBe('SUMSUB_ERROR');
  });

  it('ignores a message it does not know', () => {
    expect(interpretSumsubWebMessage('idCheck.onSomethingNew', {})).toBeNull();
    expect(interpretSumsubWebMessage('', {})).toBeNull();
  });
});
