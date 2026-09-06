import { ClientErrorCodes } from '@blinkbitcoin/kyc-core/hosted';

import {
  mapSumsubMobileErrorCode,
  mapSumsubMobileResult,
  mapSumsubMobileStatus,
} from '../mapping';

import type { SNSMobileSDKResult } from '../types';

const result = (over: Partial<SNSMobileSDKResult>): SNSMobileSDKResult => ({
  success: true,
  status: 'Approved',
  ...over,
});

describe('mapSumsubMobileStatus', () => {
  it.each([
    ['Ready', 'initial'],
    ['Initial', 'initial'],
    ['Incomplete', 'incomplete'],
    ['Pending', 'pending'],
    ['TemporarilyDeclined', 'declined'],
    ['FinallyRejected', 'finallyRejected'],
    ['Approved', 'approved'],
  ])('maps %s to %s', (status, expected) => {
    expect(mapSumsubMobileStatus(status)).toBe(expected);
  });

  it.each(['Failed', 'ActionCompleted', 'SomethingNew'])(
    'has no normalized status for %s',
    status => {
      expect(mapSumsubMobileStatus(status)).toBeNull();
    },
  );
});

describe('mapSumsubMobileErrorCode', () => {
  it('maps Unauthorized to the token-expired client code', () => {
    expect(
      mapSumsubMobileErrorCode(result({ errorType: 'Unauthorized' })),
    ).toBe(ClientErrorCodes.TOKEN_EXPIRED);
  });

  it('maps NetworkError to the network client code', () => {
    expect(
      mapSumsubMobileErrorCode(result({ errorType: 'NetworkError' })),
    ).toBe(ClientErrorCodes.NETWORK_ERROR);
  });

  it.each([
    ['Unknown', 'SUMSUB_UNKNOWN'],
    ['InvalidParameters', 'SUMSUB_INVALIDPARAMETERS'],
    ['InitialLoadingFailed', 'SUMSUB_INITIALLOADINGFAILED'],
    ['ApplicantNotFound', 'SUMSUB_APPLICANTNOTFOUND'],
    ['ApplicantMisconfigured', 'SUMSUB_APPLICANTMISCONFIGURED'],
    ['UnexpectedError', 'SUMSUB_UNEXPECTEDERROR'],
    ['InterruptedError', 'SUMSUB_INTERRUPTEDERROR'],
  ])('namespaces %s as %s', (errorType, expected) => {
    expect(
      mapSumsubMobileErrorCode(result({ errorType: errorType as never })),
    ).toBe(expected);
  });

  it('falls back to the SDK status when there is no error type', () => {
    expect(
      mapSumsubMobileErrorCode(result({ success: false, status: 'Failed' })),
    ).toBe('SUMSUB_FAILED');
    expect(
      mapSumsubMobileErrorCode(
        result({ success: true, status: 'ActionCompleted' }),
      ),
    ).toBe('SUMSUB_ACTIONCOMPLETED');
  });
});

describe('mapSumsubMobileResult', () => {
  it('completes on a successful, mappable status', () => {
    expect(mapSumsubMobileResult(result({ status: 'Approved' }))).toEqual({
      type: 'complete',
      status: 'approved',
    });
    expect(mapSumsubMobileResult(result({ status: 'Pending' }))).toEqual({
      type: 'complete',
      status: 'pending',
    });
  });

  it('errors when the SDK reports a failure, carrying the SDK message', () => {
    expect(
      mapSumsubMobileResult(
        result({
          success: false,
          status: 'Failed',
          errorType: 'NetworkError',
          errorMsg: 'offline',
        }),
      ),
    ).toEqual({
      type: 'error',
      code: ClientErrorCodes.NETWORK_ERROR,
      message: 'offline',
    });
  });

  it('omits the message when the SDK gives none', () => {
    expect(
      mapSumsubMobileResult(result({ success: false, status: 'Failed' })),
    ).toEqual({ type: 'error', code: 'SUMSUB_FAILED' });
  });

  it('errors on a success whose status carries no normalized meaning', () => {
    expect(
      mapSumsubMobileResult(
        result({ success: true, status: 'ActionCompleted' }),
      ),
    ).toEqual({ type: 'error', code: 'SUMSUB_ACTIONCOMPLETED' });
  });
});
