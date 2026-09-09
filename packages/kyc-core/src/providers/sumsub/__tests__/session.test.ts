import { SUMSUB_PROVIDER, sumsubSession } from '../session';

describe('sumsubSession', () => {
  it('tags a session with the sumsub provider id', () => {
    expect(SUMSUB_PROVIDER).toBe('sumsub');
    expect(sumsubSession({ accessToken: 't' })).toEqual({
      provider: 'sumsub',
      accessToken: 't',
    });
  });

  it('never lets the caller override the provider id', () => {
    expect(
      sumsubSession({ provider: 'other', applicantId: 'a' } as never).provider,
    ).toBe('sumsub');
  });
});
