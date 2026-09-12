import type { Logger } from '../../../log';
import {
  createMockProvider,
  MOCK_APPLICANT_PREFIX,
  MOCK_TOKEN_PREFIX,
} from '../provider';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const fakeLogger = (): Logger & { error: jest.Mock } => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const setup = (
  over: Partial<Parameters<typeof createMockProvider>[0]> = {},
) => {
  const logger = fakeLogger();
  const provider = createMockProvider({
    publicBaseUrl: () => 'https://kyc.example.com',
    logger,
    ...over,
  });
  return { provider, logger };
};

describe('createSession / refreshToken / getStatus', () => {
  it('returns a prefixed applicant id, token and expiry, recorded as initial', async () => {
    const { provider } = setup({ now: () => new Date('2026-09-10T10:00:00Z') });
    const session = await provider.createSession('user-1', { platform: 'WEB' });
    expect(session.providerApplicantId).toMatch(
      new RegExp(`^${MOCK_APPLICANT_PREFIX}${UUID.source}$`),
    );
    expect(session.accessToken).toMatch(
      new RegExp(`^${MOCK_TOKEN_PREFIX}${UUID.source}$`),
    );
    expect(session.expiresAt).toBe('2026-09-10T10:10:00.000Z');
    await expect(
      provider.getStatus(session.providerApplicantId!),
    ).resolves.toBe('initial');
  });

  it('mints a new token on refresh without touching the status', async () => {
    const { provider } = setup();
    const session = await provider.createSession('user-1', { platform: 'WEB' });
    provider.setApplicantStatus(session.providerApplicantId!, 'pending');
    const refreshed = await provider.refreshToken(
      { userId: 'user-1', providerApplicantId: session.providerApplicantId },
      { platform: 'WEB' },
    );
    expect(refreshed.accessToken).toMatch(new RegExp(`^${MOCK_TOKEN_PREFIX}`));
    expect(refreshed.accessToken).not.toBe(session.accessToken);
    await expect(
      provider.getStatus(session.providerApplicantId!),
    ).resolves.toBe('pending');
  });

  it('throws SESSION_NOT_FOUND for an unknown applicant and offers no user lookup', async () => {
    const { provider } = setup();
    await expect(provider.getStatus('nope')).rejects.toMatchObject({
      extensions: { code: 'SESSION_NOT_FOUND' },
    });
    expect(provider.getStatusByUserId).toBeUndefined();
  });

  it('keeps applicants per handle, with the test helpers', async () => {
    const { provider } = setup();
    const other = createMockProvider({ publicBaseUrl: () => 'x' });
    provider.addApplicant('mock-applicant-x', {
      status: 'approved',
      userId: 'user-9',
    });
    await expect(provider.getStatus('mock-applicant-x')).resolves.toBe(
      'approved',
    );
    await expect(other.getStatus('mock-applicant-x')).rejects.toBeDefined();
    expect(() =>
      provider.setApplicantStatus('unknown', 'approved'),
    ).not.toThrow();
    provider.addApplicant('mock-applicant-y');
    await expect(provider.getStatus('mock-applicant-y')).resolves.toBe(
      'initial',
    );
    provider.clearApplicants();
    await expect(provider.getStatus('mock-applicant-x')).rejects.toBeDefined();
  });

  it('uses injected ids', async () => {
    const { provider } = setup({ newId: () => 'fixed' });
    await expect(
      provider.createSession('u', { platform: 'IOS' }),
    ).resolves.toMatchObject({
      providerApplicantId: 'mock-applicant-fixed',
      accessToken: 'mock-token-fixed',
    });
  });
});

describe('webhook signing', () => {
  const body = JSON.stringify({
    applicantId: 'mock-applicant-x',
    status: 'approved',
  });

  it('defaults the secret to "mock" and honours a host secret', () => {
    const defaulted = setup().provider;
    const custom = setup({ webhookSecret: () => 'other' }).provider;
    expect(defaulted.signWebhook(body)).not.toBe(custom.signWebhook(body));
    expect(
      defaulted.verifyWebhook(
        { 'x-mock-signature': defaulted.signWebhook(body) },
        body,
      ),
    ).toBe(true);
    expect(
      custom.verifyWebhook(
        { 'x-mock-signature': defaulted.signWebhook(body) },
        body,
      ),
    ).toBe(false);
  });

  it('rejects a wrong signature, a missing header and an array-valued header', () => {
    const { provider, logger } = setup();
    expect(
      provider.verifyWebhook({ 'x-mock-signature': 'deadbeef' }, body),
    ).toBe(false);
    expect(provider.verifyWebhook({}, body)).toBe(false);
    expect(provider.verifyWebhook({ 'x-mock-signature': ['a'] }, body)).toBe(
      false,
    );
    expect(logger.error).toHaveBeenCalledTimes(3);
  });

  it('includes the ip in the logged security event when one is given', () => {
    const { provider, logger } = setup();
    provider.verifyWebhook({}, body, '203.0.113.1');
    provider.verifyWebhook(
      { 'x-mock-signature': 'deadbeef' },
      body,
      '203.0.113.1',
    );
    for (const call of logger.error.mock.calls) {
      expect(call[0]).toBe('Security event:');
      expect(call[1]).toContain('203.0.113.1');
    }
  });

  it('logs through console by default', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    createMockProvider({ publicBaseUrl: () => 'x' }).verifyWebhook({}, body);
    expect(error).toHaveBeenCalledWith('Security event:', expect.any(String));
    error.mockRestore();
  });
});

describe('parseWebhookEvent', () => {
  it('parses the simple { applicantId, status } payload', () => {
    const { provider } = setup();
    expect(
      provider.parseWebhookEvent(
        JSON.stringify({
          applicantId: 'a1',
          status: 'approved',
          externalUserId: 'user-1',
        }),
      ),
    ).toEqual({
      providerApplicantId: 'a1',
      externalUserId: 'user-1',
      status: 'approved',
      rawStatus: 'approved',
    });
  });

  it('passes a level and reject labels through, and ignores malformed ones', () => {
    const { provider } = setup();
    expect(
      provider.parseWebhookEvent(
        JSON.stringify({
          applicantId: 'a1',
          status: 'declined',
          levelName: 'card',
          rejectLabels: ['BAD_SELFIE'],
        }),
      ),
    ).toMatchObject({ levelName: 'card', rejectLabels: ['BAD_SELFIE'] });
    for (const extra of [
      { levelName: '', rejectLabels: [] },
      { levelName: 7, rejectLabels: ['x', 1] },
      { rejectLabels: 'BAD' },
    ]) {
      const event = provider.parseWebhookEvent(
        JSON.stringify({ applicantId: 'a1', status: 'declined', ...extra }),
      );
      expect(event).not.toHaveProperty('levelName');
      expect(event).not.toHaveProperty('rejectLabels');
    }
  });

  it('updates a known applicant status as a side effect', async () => {
    const { provider } = setup();
    provider.addApplicant('mock-applicant-y');
    provider.parseWebhookEvent(
      JSON.stringify({ applicantId: 'mock-applicant-y', status: 'approved' }),
    );
    await expect(provider.getStatus('mock-applicant-y')).resolves.toBe(
      'approved',
    );
  });

  it('reports an unknown status as null rather than failing', () => {
    const { provider } = setup();
    expect(
      provider.parseWebhookEvent(
        JSON.stringify({ applicantId: 'a1', status: 'nope' }),
      ),
    ).toEqual({
      providerApplicantId: 'a1',
      externalUserId: undefined,
      status: null,
      rawStatus: 'nope',
    });
  });

  it('returns null for malformed or incomplete payloads', () => {
    const { provider } = setup();
    expect(provider.parseWebhookEvent('{')).toBeNull();
    expect(provider.parseWebhookEvent('42')).toBeNull();
    expect(
      provider.parseWebhookEvent(JSON.stringify({ status: 'approved' })),
    ).toBeNull();
    expect(
      provider.parseWebhookEvent(JSON.stringify({ applicantId: '' })),
    ).toBeNull();
  });
});

describe('hostedPage', () => {
  it('renders the mock page with webhooks pre-signed for this session', () => {
    const { provider } = setup();
    const html = provider.hostedPage.render({
      sessionId: 'session-1',
      userId: 'user-1',
      applicantId: 'mock-applicant-1',
      accessToken: 'mock-token-1',
      nonce: 'n',
    });
    const approve = JSON.stringify({
      applicantId: 'mock-applicant-1',
      externalUserId: 'user-1',
      status: 'approved',
    });
    expect(html).toContain('https://kyc.example.com/webhook/kyc/mock');
    expect(html).toContain(provider.signWebhook(approve));
    expect(html).toContain('Session session-1');
    expect(provider.hostedPage.csp).toBeUndefined();
    expect(provider.hostedPage.permissionsPolicy).toBeUndefined();
  });

  it('posts a null applicant for an unbound session', () => {
    const { provider } = setup();
    const html = provider.hostedPage.render({
      sessionId: 'session-1',
      userId: 'user-1',
      accessToken: 't',
      nonce: 'n',
    });
    expect(html).toContain('\\"applicantId\\":null');
    expect(html).toContain('\\"externalUserId\\":\\"user-1\\"');
    expect(html).toContain('var applicantId = null;');
  });
});
