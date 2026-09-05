import crypto from 'crypto';
import { vi } from 'vitest';
import { SumsubProvider } from '../src/providers/sumsub';
import { HttpError } from '../src/providers/sumsub/client';

vi.mock('../src/providers/sumsub/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/providers/sumsub/client')>();
  return {
    ...actual,
    createAccessToken: vi.fn(),
    fetchApplicantStatus: vi.fn(),
    fetchApplicantByExternalUserId: vi.fn(),
  };
});

const client = await import('../src/providers/sumsub/client');
const createAccessToken = client.createAccessToken as ReturnType<typeof vi.fn>;
const fetchApplicantStatus = client.fetchApplicantStatus as ReturnType<typeof vi.fn>;
const fetchApplicantByExternalUserId = client.fetchApplicantByExternalUserId as ReturnType<
  typeof vi.fn
>;

const originalEnv = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, {
    SUMSUB_APP_TOKEN: 'app-token',
    SUMSUB_SECRET_KEY: 'secret-key',
    SUMSUB_WEBHOOK_SECRET: 'webhook-secret',
    SUMSUB_LEVEL_NAME: 'default-level',
    SUMSUB_TOKEN_TTL_SECS: '600',
  });
  vi.clearAllMocks();
  createAccessToken.mockResolvedValue({ token: 'sumsub-token', userId: 'user-1' });
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('SumsubProvider.createSession', () => {
  it('mints a token for the configured level and reports the expiry', async () => {
    vi.setSystemTime(new Date('2026-09-06T00:00:00.000Z'));
    const session = await SumsubProvider.createSession('user-1', { platform: 'IOS' });
    expect(createAccessToken).toHaveBeenCalledWith('user-1', 'default-level', 600);
    expect(session).toEqual({
      accessToken: 'sumsub-token',
      expiresAt: '2026-09-06T00:10:00.000Z',
    });
    vi.useRealTimers();
  });

  it('prefers the level name from the input', async () => {
    await SumsubProvider.createSession('user-1', { platform: 'WEB', levelName: 'id-only' });
    expect(createAccessToken).toHaveBeenCalledWith('user-1', 'id-only', 600);
  });

  it('maps a client error to SESSION_CREATION_FAILED', async () => {
    createAccessToken.mockRejectedValue(new HttpError(400, 'bad level'));
    await expect(SumsubProvider.createSession('u', { platform: 'WEB' })).rejects.toMatchObject({
      extensions: { code: 'SESSION_CREATION_FAILED' },
    });
  });

  it('maps any other failure to PROVIDER_UNAVAILABLE', async () => {
    createAccessToken.mockRejectedValue(new HttpError(503, 'down'));
    await expect(SumsubProvider.createSession('u', { platform: 'WEB' })).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });
});

describe('SumsubProvider.refreshToken', () => {
  it('mints a replacement token for the same user and level', async () => {
    await expect(
      SumsubProvider.refreshToken(
        { userId: 'user-1', providerApplicantId: 'a1' },
        {
          platform: 'ANDROID',
          levelName: 'id-only',
        }
      )
    ).resolves.toMatchObject({ accessToken: 'sumsub-token' });
    expect(createAccessToken).toHaveBeenCalledWith('user-1', 'id-only', 600);
  });

  it('maps failures the same way as createSession', async () => {
    createAccessToken.mockRejectedValue(new HttpError(401, 'bad app token'));
    await expect(
      SumsubProvider.refreshToken({ userId: 'u' }, { platform: 'WEB' })
    ).rejects.toMatchObject({ extensions: { code: 'SESSION_CREATION_FAILED' } });
    createAccessToken.mockRejectedValue(new Error('network'));
    await expect(
      SumsubProvider.refreshToken({ userId: 'u' }, { platform: 'WEB' })
    ).rejects.toMatchObject({ extensions: { code: 'PROVIDER_UNAVAILABLE' } });
  });
});

describe('SumsubProvider.getStatus / getStatusByUserId', () => {
  it('normalizes the applicant review', async () => {
    fetchApplicantStatus.mockResolvedValue({
      reviewStatus: 'completed',
      reviewResult: { reviewAnswer: 'GREEN' },
    });
    await expect(SumsubProvider.getStatus('a1')).resolves.toBe('approved');
  });

  it('maps a 404 to SESSION_NOT_FOUND and anything else to PROVIDER_UNAVAILABLE', async () => {
    fetchApplicantStatus.mockRejectedValue(new HttpError(404, ''));
    await expect(SumsubProvider.getStatus('a1')).rejects.toMatchObject({
      extensions: { code: 'SESSION_NOT_FOUND' },
    });
    fetchApplicantStatus.mockRejectedValue(new HttpError(500, ''));
    await expect(SumsubProvider.getStatus('a1')).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });

  it('normalizes the applicant found by external user id', async () => {
    fetchApplicantByExternalUserId.mockResolvedValue({
      applicantId: 'a1',
      review: { reviewStatus: 'pending' },
    });
    await expect(SumsubProvider.getStatusByUserId!('user-1')).resolves.toBe('pending');
  });

  it('reports initial rather than failing when the applicant does not exist yet', async () => {
    fetchApplicantByExternalUserId.mockRejectedValue(new HttpError(404, ''));
    await expect(SumsubProvider.getStatusByUserId!('user-1')).resolves.toBe('initial');
  });

  it('maps other lookup failures to PROVIDER_UNAVAILABLE', async () => {
    fetchApplicantByExternalUserId.mockRejectedValue(new HttpError(500, ''));
    await expect(SumsubProvider.getStatusByUserId!('user-1')).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });
});

describe('SumsubProvider.verifyWebhook', () => {
  const body = '{"type":"applicantReviewed","applicantId":"a1"}';
  const digest = (algorithm: string) =>
    crypto.createHmac(algorithm, 'webhook-secret').update(body, 'utf8').digest('hex');

  it('accepts a correct HMAC_SHA256_HEX digest', () => {
    expect(SumsubProvider.verifyWebhook({ 'x-payload-digest': digest('sha256') }, body)).toBe(true);
  });

  it('honours the algorithm header', () => {
    expect(
      SumsubProvider.verifyWebhook(
        { 'x-payload-digest': digest('sha512'), 'x-payload-digest-alg': 'HMAC_SHA512_HEX' },
        body
      )
    ).toBe(true);
  });

  it('rejects a tampered body, an array-valued header and an unknown algorithm', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(SumsubProvider.verifyWebhook({ 'x-payload-digest': digest('sha256') }, `${body} `)).toBe(
      false
    );
    expect(SumsubProvider.verifyWebhook({ 'x-payload-digest': ['a', 'b'] }, body)).toBe(false);
    expect(
      SumsubProvider.verifyWebhook(
        { 'x-payload-digest': digest('sha256'), 'x-payload-digest-alg': ['HMAC_SHA256_HEX'] },
        body
      )
    ).toBe(false);
  });
});

describe('SumsubProvider.parseWebhookEvent', () => {
  it('parses an actionable event', () => {
    expect(
      SumsubProvider.parseWebhookEvent(
        JSON.stringify({
          type: 'applicantReviewed',
          applicantId: 'a1',
          externalUserId: 'user-1',
          reviewStatus: 'completed',
          reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL' },
        })
      )
    ).toEqual({
      providerApplicantId: 'a1',
      externalUserId: 'user-1',
      status: 'finallyRejected',
      rawStatus: 'applicantReviewed:completed',
    });
  });

  it('reports a non-actionable event with a null status', () => {
    expect(
      SumsubProvider.parseWebhookEvent(
        JSON.stringify({ type: 'applicantWorkflowCompleted', applicantId: 'a1' })
      )
    ).toEqual({
      providerApplicantId: 'a1',
      externalUserId: undefined,
      status: null,
      rawStatus: 'applicantWorkflowCompleted:',
    });
  });

  it('returns null for malformed JSON and for a payload without an applicant id', () => {
    expect(SumsubProvider.parseWebhookEvent('not json')).toBeNull();
    expect(SumsubProvider.parseWebhookEvent('"a string"')).toBeNull();
    expect(
      SumsubProvider.parseWebhookEvent(JSON.stringify({ type: 'applicantReviewed' }))
    ).toBeNull();
    expect(SumsubProvider.parseWebhookEvent(JSON.stringify({ applicantId: 'a1' }))).toBeNull();
  });
});
