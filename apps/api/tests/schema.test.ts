import { vi } from 'vitest';

vi.mock('../src/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/providers')>();
  return {
    ...actual,
    provider: {
      createSession: vi.fn(),
      refreshToken: vi.fn(),
      getStatus: vi.fn(),
      verifyWebhook: vi.fn(),
      parseWebhookEvent: vi.fn(),
    },
    getProviderName: vi.fn(() => 'mock'),
  };
});
vi.mock('../src/session');
vi.mock('../src/audit');

const { provider } = await import('../src/providers');
const session = await import('../src/session');
const audit = await import('../src/audit');
const { knex } = await import('../src/db');
const { resolvers } = await import('../src/schema');

const context = { userId: 'user-1' };
const anonymous = { userId: null };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'session-1',
  userId: 'user-1',
  provider: 'mock',
  providerApplicantId: 'mock-applicant-1',
  levelName: null,
  platform: 'WEB',
  status: 'initial',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = 'https://kyc.example.com';
  vi.mocked(session.createSession).mockResolvedValue(row() as never);
  vi.mocked(session.bindApplicantId).mockResolvedValue(row() as never);
  vi.mocked(provider.createSession).mockResolvedValue({
    accessToken: 'mock-token-1',
    providerApplicantId: 'mock-applicant-1',
  });
  vi.mocked(provider.refreshToken).mockResolvedValue({ accessToken: 'mock-token-2' });
  vi.spyOn(knex, 'transaction').mockImplementation(
    // biome-ignore lint/suspicious/noExplicitAny: knex's transaction overloads
    (async (fn: any) => fn(knex)) as any
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.PUBLIC_BASE_URL;
  vi.restoreAllMocks();
});

describe('Query.health', () => {
  it('reports ok with an ISO timestamp', () => {
    const result = resolvers.Query.health();
    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});

describe('Mutation.verificationSessionStart', () => {
  const start = (input: Record<string, unknown>, ctx = context) =>
    resolvers.Mutation.verificationSessionStart(null, { input } as never, ctx as never);

  it('requires authentication', async () => {
    await expect(start({ platform: 'WEB' }, anonymous)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHORIZED' },
    });
  });

  it.each([
    [{}, /platform/],
    [{ platform: 'DESKTOP' }, /platform/],
    [{ platform: 'WEB', levelName: '   ' }, /levelName/],
    [{ platform: 'WEB', levelName: 'x'.repeat(101) }, /levelName/],
    [{ platform: 'WEB', locale: 'x'.repeat(36) }, /locale/],
  ])('rejects invalid input %j', async (input, message) => {
    await expect(start(input)).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
      message: expect.stringMatching(message),
    });
  });

  it('persists the session, mints a token and returns the hosted url', async () => {
    await expect(start({ platform: 'IOS', levelName: 'basic', locale: 'en' })).resolves.toEqual({
      sessionId: 'session-1',
      provider: 'mock',
      status: 'initial',
      accessToken: 'mock-token-1',
      url: 'https://kyc.example.com/hosted/session-1',
      allowedOrigin: 'https://kyc.example.com',
      applicantId: 'mock-applicant-1',
    });

    expect(session.createSession).toHaveBeenCalledWith(
      { userId: 'user-1', provider: 'mock', platform: 'IOS', levelName: 'basic' },
      knex
    );
    expect(audit.logAuditEvent).toHaveBeenCalledWith(
      'session-1',
      'session_created',
      { userId: 'user-1', provider: 'mock', platform: 'IOS', levelName: 'basic' },
      knex
    );
    expect(provider.createSession).toHaveBeenCalledWith('user-1', {
      platform: 'IOS',
      levelName: 'basic',
      locale: 'en',
    });
    expect(session.bindApplicantId).toHaveBeenCalledWith('session-1', 'mock-applicant-1');
  });

  it('omits the applicant id when the provider does not know one yet', async () => {
    vi.mocked(provider.createSession).mockResolvedValue({ accessToken: 'sumsub-token' });
    const result = await start({ platform: 'WEB' });
    expect(result.applicantId).toBeNull();
    expect(session.bindApplicantId).not.toHaveBeenCalled();
  });

  it('maps a persistence failure to PERSISTENCE_FAILED', async () => {
    vi.mocked(session.createSession).mockRejectedValue(new Error('db down'));
    await expect(start({ platform: 'WEB' })).rejects.toMatchObject({
      extensions: { code: 'PERSISTENCE_FAILED' },
    });
    expect(provider.createSession).not.toHaveBeenCalled();
  });

  it('maps a non-Error persistence failure to PERSISTENCE_FAILED', async () => {
    vi.mocked(session.createSession).mockRejectedValue('boom');
    await expect(start({ platform: 'WEB' })).rejects.toMatchObject({
      extensions: { code: 'PERSISTENCE_FAILED' },
    });
  });

  it('treats a non-string extensions.code as no code', async () => {
    vi.mocked(provider.createSession).mockRejectedValue({ extensions: { code: 42 } });
    await expect(start({ platform: 'WEB' })).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });

  it('audits and rethrows a provider error that already carries a code', async () => {
    const { Errors } = await import('../src/errors');
    vi.mocked(provider.createSession).mockRejectedValue(Errors.sessionCreationFailed());
    await expect(start({ platform: 'WEB' })).rejects.toMatchObject({
      extensions: { code: 'SESSION_CREATION_FAILED' },
    });
    expect(audit.logAuditEvent).toHaveBeenCalledWith('session-1', 'creation_failed', {
      errorCode: 'SESSION_CREATION_FAILED',
      source: 'api',
    });
  });

  it('maps an uncoded provider failure to PROVIDER_UNAVAILABLE', async () => {
    vi.mocked(provider.createSession).mockRejectedValue(new Error('socket hang up'));
    await expect(start({ platform: 'WEB' })).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
    expect(audit.logAuditEvent).toHaveBeenCalledWith('session-1', 'creation_failed', {
      errorCode: 'UNKNOWN_ERROR',
      source: 'api',
    });
  });
});

describe('Mutation.verificationSessionRefresh', () => {
  const refresh = (sessionId: string, ctx = context) =>
    resolvers.Mutation.verificationSessionRefresh(null, { sessionId }, ctx as never);

  it('requires authentication and a non-empty id', async () => {
    await expect(refresh('session-1', anonymous)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHORIZED' },
    });
    await expect(refresh('  ')).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
  });

  it('is SESSION_NOT_FOUND for a session the user does not own', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(null);
    await expect(refresh('session-1')).rejects.toMatchObject({
      extensions: { code: 'SESSION_NOT_FOUND' },
    });
  });

  it('mints a replacement token for the session platform and level', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(
      row({ platform: 'ANDROID', levelName: 'basic' }) as never
    );
    await expect(refresh('session-1')).resolves.toEqual({ accessToken: 'mock-token-2' });
    expect(provider.refreshToken).toHaveBeenCalledWith(
      { userId: 'user-1', providerApplicantId: 'mock-applicant-1' },
      { platform: 'ANDROID', levelName: 'basic' }
    );
    expect(audit.logAuditEvent).toHaveBeenCalledWith('session-1', 'token_refreshed', {
      userId: 'user-1',
      source: 'api',
    });
  });

  it('passes no applicant id or level when the session has none', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(
      row({ providerApplicantId: null, levelName: null }) as never
    );
    await refresh('session-1');
    expect(provider.refreshToken).toHaveBeenCalledWith(
      { userId: 'user-1', providerApplicantId: undefined },
      { platform: 'WEB', levelName: undefined }
    );
  });

  it('maps an uncoded provider failure to PROVIDER_UNAVAILABLE', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(row() as never);
    vi.mocked(provider.refreshToken).mockRejectedValue(new Error('timeout'));
    await expect(refresh('session-1')).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });

  it('rethrows a provider refresh error that already carries a code', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(row() as never);
    const { Errors } = await import('../src/errors');
    vi.mocked(provider.refreshToken).mockRejectedValue(Errors.sessionNotFound());
    await expect(refresh('session-1')).rejects.toMatchObject({
      extensions: { code: 'SESSION_NOT_FOUND' },
    });
  });
});

describe('Query.verificationSession', () => {
  const query = (id: string, ctx = context) =>
    resolvers.Query.verificationSession(null, { id }, ctx as never);

  it('requires authentication and a non-empty id', async () => {
    await expect(query('session-1', anonymous)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHORIZED' },
    });
    await expect(query('')).rejects.toMatchObject({ extensions: { code: 'VALIDATION_ERROR' } });
  });

  it('is SESSION_NOT_FOUND for another user session', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(null);
    await expect(query('session-1')).rejects.toMatchObject({
      extensions: { code: 'SESSION_NOT_FOUND' },
    });
  });

  it('returns the stored status (webhooks are the source of truth)', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(
      row({ status: 'approved' }) as never
    );
    await expect(query('session-1')).resolves.toEqual({
      sessionId: 'session-1',
      provider: 'mock',
      status: 'approved',
      applicantId: 'mock-applicant-1',
    });
  });

  it('reconciles with the provider while no applicant is bound and the provider can look up by user', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(
      row({ providerApplicantId: null, status: 'initial' }) as never
    );
    vi.mocked(session.updateSessionStatus).mockResolvedValue(
      row({ providerApplicantId: null, status: 'pending' }) as never
    );
    // The mocked provider gains the optional capability for this test only.
    (provider as { getStatusByUserId?: unknown }).getStatusByUserId = vi.fn(async () => 'pending');

    await expect(query('session-1')).resolves.toMatchObject({ status: 'pending' });
    expect(session.updateSessionStatus).toHaveBeenCalledWith('session-1', 'pending');
    expect(audit.logAuditEvent).toHaveBeenCalledWith('session-1', 'status_updated', {
      status: 'pending',
      previousStatus: 'initial',
      source: 'api',
    });

    delete (provider as { getStatusByUserId?: unknown }).getStatusByUserId;
  });

  it('keeps the stored status when the reconciliation would not advance it', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(
      row({ providerApplicantId: null, status: 'pending' }) as never
    );
    (provider as { getStatusByUserId?: unknown }).getStatusByUserId = vi.fn(async () => 'initial');

    await expect(query('session-1')).resolves.toMatchObject({ status: 'pending' });
    expect(session.updateSessionStatus).not.toHaveBeenCalled();

    delete (provider as { getStatusByUserId?: unknown }).getStatusByUserId;
  });

  it('never reconciles a terminal session', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(
      row({ providerApplicantId: null, status: 'approved' }) as never
    );
    const lookup = vi.fn();
    (provider as { getStatusByUserId?: unknown }).getStatusByUserId = lookup;

    await expect(query('session-1')).resolves.toMatchObject({ status: 'approved' });
    expect(lookup).not.toHaveBeenCalled();

    delete (provider as { getStatusByUserId?: unknown }).getStatusByUserId;
  });

  it('falls back to the stored status when the lookup fails', async () => {
    vi.mocked(session.getSessionByIdForUser).mockResolvedValue(
      row({ providerApplicantId: null, status: 'initial' }) as never
    );
    (provider as { getStatusByUserId?: unknown }).getStatusByUserId = vi.fn(async () => {
      throw new Error('provider down');
    });

    await expect(query('session-1')).resolves.toMatchObject({ status: 'initial' });

    delete (provider as { getStatusByUserId?: unknown }).getStatusByUserId;
  });
});
