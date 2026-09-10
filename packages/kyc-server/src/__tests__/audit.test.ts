import { ALLOWED_METADATA_KEYS, sanitizeAuditMetadata } from '../audit';

describe('sanitizeAuditMetadata', () => {
  it('keeps the allow-listed keys', () => {
    expect(
      sanitizeAuditMetadata({
        userId: 'user-1',
        provider: 'mock',
        platform: 'WEB',
        levelName: 'basic',
        source: 'api',
      }),
    ).toEqual({
      userId: 'user-1',
      provider: 'mock',
      platform: 'WEB',
      levelName: 'basic',
      source: 'api',
    });
  });

  it('drops keys outside the allow-list (no PII ever reaches the table)', () => {
    expect(
      sanitizeAuditMetadata({
        status: 'approved',
        // @ts-expect-error deliberately passing keys the type does not allow
        applicantName: 'Ada Lovelace',
        accessToken: 'secret',
      }),
    ).toEqual({ status: 'approved' });
  });

  it('is an empty object when no metadata is supplied', () => {
    expect(sanitizeAuditMetadata()).toEqual({});
  });

  it('exposes the allow-list for review', () => {
    expect([...ALLOWED_METADATA_KEYS].sort()).toEqual([
      'errorCode',
      'levelName',
      'platform',
      'previousStatus',
      'provider',
      'reason',
      'source',
      'status',
      'userId',
    ]);
  });
});
