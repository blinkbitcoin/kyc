import { vi } from 'vitest';
import {
  addApplicant,
  clearApplicants,
  getMockWebhookSecret,
  MOCK_APPLICANT_PREFIX,
  MOCK_TOKEN_PREFIX,
  MockProvider,
  setApplicantStatus,
  signMockWebhook,
} from '../src/providers/mock';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

beforeEach(() => clearApplicants());

afterEach(() => {
  delete process.env.MOCK_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe('MockProvider.createSession', () => {
  it('returns a prefixed applicant id, token and expiry', async () => {
    const session = await MockProvider.createSession('user-1', { platform: 'WEB' });
    expect(session.providerApplicantId).toMatch(
      new RegExp(`^${MOCK_APPLICANT_PREFIX}${UUID.source}$`)
    );
    expect(session.accessToken).toMatch(new RegExp(`^${MOCK_TOKEN_PREFIX}${UUID.source}$`));
    expect(new Date(session.expiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('records the applicant as initial and remembers the user', async () => {
    const { providerApplicantId } = await MockProvider.createSession('user-1', {
      platform: 'IOS',
    });
    await expect(MockProvider.getStatus(providerApplicantId!)).resolves.toBe('initial');
  });
});

describe('MockProvider.refreshToken', () => {
  it('mints a new token without touching the status', async () => {
    const session = await MockProvider.createSession('user-1', { platform: 'WEB' });
    setApplicantStatus(session.providerApplicantId!, 'pending');
    const refreshed = await MockProvider.refreshToken(
      { userId: 'user-1', providerApplicantId: session.providerApplicantId },
      { platform: 'WEB' }
    );
    expect(refreshed.accessToken).toMatch(new RegExp(`^${MOCK_TOKEN_PREFIX}`));
    expect(refreshed.accessToken).not.toBe(session.accessToken);
    await expect(MockProvider.getStatus(session.providerApplicantId!)).resolves.toBe('pending');
  });
});

describe('MockProvider.getStatus', () => {
  it('throws SESSION_NOT_FOUND for an unknown applicant', async () => {
    await expect(MockProvider.getStatus('nope')).rejects.toMatchObject({
      extensions: { code: 'SESSION_NOT_FOUND' },
    });
  });

  it('reflects a status set through the test helpers', async () => {
    addApplicant('mock-applicant-x', { status: 'approved', userId: 'user-9' });
    await expect(MockProvider.getStatus('mock-applicant-x')).resolves.toBe('approved');
  });

  it('ignores setApplicantStatus for an unknown applicant', () => {
    expect(() => setApplicantStatus('unknown', 'approved')).not.toThrow();
  });

  it('does not offer the user-lookup capability', () => {
    expect(MockProvider.getStatusByUserId).toBeUndefined();
  });
});

describe('mock webhook signing', () => {
  const body = JSON.stringify({ applicantId: 'mock-applicant-x', status: 'approved' });

  it('defaults the secret to "mock"', () => {
    expect(getMockWebhookSecret()).toBe('mock');
    process.env.MOCK_WEBHOOK_SECRET = 'other';
    expect(getMockWebhookSecret()).toBe('other');
  });

  it('accepts a body signed with the configured secret', () => {
    expect(MockProvider.verifyWebhook({ 'x-mock-signature': signMockWebhook(body) }, body)).toBe(
      true
    );
  });

  it('rejects a wrong signature and a missing header', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(MockProvider.verifyWebhook({ 'x-mock-signature': 'deadbeef' }, body)).toBe(false);
    expect(MockProvider.verifyWebhook({}, body)).toBe(false);
    expect(MockProvider.verifyWebhook({ 'x-mock-signature': ['a'] }, body)).toBe(false);
  });

  it('includes the ip in the logged security event when one is given', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    MockProvider.verifyWebhook({}, body, '203.0.113.1');
    MockProvider.verifyWebhook({ 'x-mock-signature': 'deadbeef' }, body, '203.0.113.1');
    expect(error).toHaveBeenCalledTimes(2);
    for (const call of error.mock.calls) {
      expect(call[1]).toContain('203.0.113.1');
    }
  });
});

describe('MockProvider.parseWebhookEvent', () => {
  it('parses the simple { applicantId, status } payload', () => {
    expect(
      MockProvider.parseWebhookEvent(
        JSON.stringify({ applicantId: 'a1', status: 'approved', externalUserId: 'user-1' })
      )
    ).toEqual({
      providerApplicantId: 'a1',
      externalUserId: 'user-1',
      status: 'approved',
      rawStatus: 'approved',
    });
  });

  it('updates a known applicant status as a side effect', async () => {
    addApplicant('mock-applicant-y');
    MockProvider.parseWebhookEvent(
      JSON.stringify({ applicantId: 'mock-applicant-y', status: 'approved' })
    );
    await expect(MockProvider.getStatus('mock-applicant-y')).resolves.toBe('approved');
  });

  it('reports an unknown status as null rather than failing', () => {
    expect(
      MockProvider.parseWebhookEvent(JSON.stringify({ applicantId: 'a1', status: 'nope' }))
    ).toEqual({
      providerApplicantId: 'a1',
      externalUserId: undefined,
      status: null,
      rawStatus: 'nope',
    });
  });

  it('returns null for malformed or incomplete payloads', () => {
    expect(MockProvider.parseWebhookEvent('{')).toBeNull();
    expect(MockProvider.parseWebhookEvent('42')).toBeNull();
    expect(MockProvider.parseWebhookEvent(JSON.stringify({ status: 'approved' }))).toBeNull();
  });
});
