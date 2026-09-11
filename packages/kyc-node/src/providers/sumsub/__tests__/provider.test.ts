import { createHmac } from 'node:crypto';
import { HttpError } from '../../../http';
import type { Logger } from '../../../log';
import type { SumsubClient } from '../client';
import { sumsubConfigFromEnv } from '../config';
import { sumsubHostedPage } from '../page';
import {
  createSumsubProvider,
  SUMSUB_DIGEST_ALG_HEADER,
  SUMSUB_DIGEST_HEADER,
} from '../provider';

const config = sumsubConfigFromEnv({
  SUMSUB_APP_TOKEN: 'app-token',
  SUMSUB_SECRET_KEY: 'secret-key',
  SUMSUB_WEBHOOK_SECRET: 'webhook-secret',
  SUMSUB_LEVEL_NAME: 'default-level',
  SUMSUB_TOKEN_TTL_SECS: '600',
});

const fakeClient = (): SumsubClient & {
  createAccessToken: jest.Mock;
  fetchApplicantStatus: jest.Mock;
  fetchApplicantByExternalUserId: jest.Mock;
} => ({
  request: jest.fn(),
  createAccessToken: jest
    .fn()
    .mockResolvedValue({ token: 'sumsub-token', userId: 'user-1' }),
  fetchApplicantStatus: jest.fn(),
  fetchApplicantByExternalUserId: jest.fn(),
});

const fakeLogger = (): Logger & { error: jest.Mock; warn: jest.Mock } => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const setup = (
  over: Partial<Parameters<typeof createSumsubProvider>[0]> = {},
) => {
  const client = fakeClient();
  const provider = createSumsubProvider({
    config,
    client,
    now: () => new Date('2026-09-06T00:00:00.000Z'),
    ...over,
  });
  return { provider, client };
};

describe('createSession / refreshToken', () => {
  it('mints a token for the configured level and reports the expiry', async () => {
    const { provider, client } = setup();
    await expect(
      provider.createSession('user-1', { platform: 'IOS' }),
    ).resolves.toEqual({
      accessToken: 'sumsub-token',
      expiresAt: '2026-09-06T00:10:00.000Z',
    });
    expect(client.createAccessToken).toHaveBeenCalledWith(
      'user-1',
      'default-level',
      600,
    );
  });

  it('prefers the level name from the input, and refreshes for the same user', async () => {
    const { provider, client } = setup();
    await provider.createSession('user-1', {
      platform: 'WEB',
      levelName: 'id-only',
    });
    expect(client.createAccessToken).toHaveBeenCalledWith(
      'user-1',
      'id-only',
      600,
    );
    await expect(
      provider.refreshToken(
        { userId: 'user-1', providerApplicantId: 'a1' },
        { platform: 'ANDROID', levelName: 'id-only' },
      ),
    ).resolves.toMatchObject({ accessToken: 'sumsub-token' });
    expect(client.createAccessToken).toHaveBeenLastCalledWith(
      'user-1',
      'id-only',
      600,
    );
  });

  it('maps a client error to SESSION_CREATION_FAILED and anything else to PROVIDER_UNAVAILABLE', async () => {
    const { provider, client } = setup();
    client.createAccessToken.mockRejectedValueOnce(
      new HttpError(400, 'bad level'),
    );
    await expect(
      provider.createSession('u', { platform: 'WEB' }),
    ).rejects.toMatchObject({
      extensions: { code: 'SESSION_CREATION_FAILED' },
    });
    client.createAccessToken.mockRejectedValueOnce(new Error('network'));
    await expect(
      provider.refreshToken({ userId: 'u' }, { platform: 'WEB' }),
    ).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });

  it('reads a config getter per call', async () => {
    let current = { ...config, levelName: 'first' };
    const client = fakeClient();
    const provider = createSumsubProvider({ config: () => current, client });
    await provider.createSession('u', { platform: 'WEB' });
    expect(client.createAccessToken).toHaveBeenLastCalledWith(
      'u',
      'first',
      600,
    );
    current = { ...config, levelName: 'second' };
    await provider.createSession('u', { platform: 'WEB' });
    expect(client.createAccessToken).toHaveBeenLastCalledWith(
      'u',
      'second',
      600,
    );
    const { expiresAt } = await provider.createSession('u', {
      platform: 'WEB',
    });
    expect(new Date(expiresAt!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('getStatus / getStatusByUserId', () => {
  it('normalizes the applicant review', async () => {
    const { provider, client } = setup();
    client.fetchApplicantStatus.mockResolvedValue({
      reviewStatus: 'completed',
      reviewResult: { reviewAnswer: 'GREEN' },
    });
    await expect(provider.getStatus('a1')).resolves.toBe('approved');
  });

  it('maps a 404 to SESSION_NOT_FOUND, another 4xx to VALIDATION_ERROR and 5xx to PROVIDER_UNAVAILABLE', async () => {
    const { provider, client } = setup();
    client.fetchApplicantStatus.mockRejectedValueOnce(new HttpError(404, ''));
    await expect(provider.getStatus('a1')).rejects.toMatchObject({
      extensions: { code: 'SESSION_NOT_FOUND' },
    });
    client.fetchApplicantStatus.mockRejectedValueOnce(
      new HttpError(400, 'bad applicant id'),
    );
    await expect(provider.getStatus('a1')).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
    client.fetchApplicantStatus.mockRejectedValueOnce(new HttpError(400, ''));
    await expect(provider.getStatus('a1')).rejects.toMatchObject({
      extensions: { code: 'VALIDATION_ERROR' },
    });
    client.fetchApplicantStatus.mockRejectedValue(new HttpError(500, ''));
    await expect(provider.getStatus('a1')).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });

  it('normalizes the applicant found by external user id', async () => {
    const { provider, client } = setup();
    client.fetchApplicantByExternalUserId.mockResolvedValue({
      applicantId: 'a1',
      review: { reviewStatus: 'pending' },
    });
    await expect(provider.getStatusByUserId('user-1')).resolves.toBe('pending');
  });

  it('reports initial rather than failing when the applicant does not exist yet', async () => {
    const { provider, client } = setup();
    client.fetchApplicantByExternalUserId.mockRejectedValueOnce(
      new HttpError(404, ''),
    );
    await expect(provider.getStatusByUserId('user-1')).resolves.toBe('initial');
    client.fetchApplicantByExternalUserId.mockRejectedValue(
      new HttpError(500, ''),
    );
    await expect(provider.getStatusByUserId('user-1')).rejects.toMatchObject({
      extensions: { code: 'PROVIDER_UNAVAILABLE' },
    });
  });
});

describe('verifyWebhook', () => {
  const body = '{"type":"applicantReviewed","applicantId":"a1"}';
  const digest = (algorithm: string, secret = 'webhook-secret') =>
    createHmac(algorithm, secret).update(body, 'utf8').digest('hex');

  it('accepts a correct HMAC_SHA256_HEX digest and honours the algorithm header', () => {
    const { provider } = setup();
    expect(
      provider.verifyWebhook(
        { [SUMSUB_DIGEST_HEADER]: digest('sha256') },
        body,
      ),
    ).toBe(true);
    expect(
      provider.verifyWebhook(
        {
          [SUMSUB_DIGEST_HEADER]: digest('sha512'),
          [SUMSUB_DIGEST_ALG_HEADER]: 'HMAC_SHA512_HEX',
        },
        body,
      ),
    ).toBe(true);
  });

  it('rejects a tampered body, an array-valued header and an inherited property as the algorithm', () => {
    const logger = fakeLogger();
    const { provider } = setup({ webhook: { logger } });
    expect(
      provider.verifyWebhook(
        { [SUMSUB_DIGEST_HEADER]: digest('sha256') },
        `${body} `,
      ),
    ).toBe(false);
    expect(
      provider.verifyWebhook({ [SUMSUB_DIGEST_HEADER]: ['a', 'b'] }, body),
    ).toBe(false);
    expect(
      provider.verifyWebhook(
        {
          [SUMSUB_DIGEST_HEADER]: digest('sha256'),
          [SUMSUB_DIGEST_ALG_HEADER]: ['HMAC_SHA256_HEX'],
        },
        body,
      ),
    ).toBe(false);
    expect(
      provider.verifyWebhook(
        {
          [SUMSUB_DIGEST_HEADER]: digest('sha256'),
          [SUMSUB_DIGEST_ALG_HEADER]: 'constructor',
        },
        body,
        '203.0.113.7',
      ),
    ).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenLastCalledWith(
      'Security event:',
      expect.stringContaining('203.0.113.7'),
    );
  });

  it('fails closed without a secret unless the host allows it, logging through the provider logger', () => {
    const logger = fakeLogger();
    const noSecret = { ...config, webhookSecret: undefined };
    const strict = createSumsubProvider({
      config: noSecret,
      client: fakeClient(),
      logger,
    });
    expect(strict.verifyWebhook({}, body)).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Security event:',
      expect.stringContaining('not configured'),
    );
    const open = createSumsubProvider({
      config: noSecret,
      client: fakeClient(),
      webhook: { allowMissingSecret: () => true, logger },
    });
    expect(open.verifyWebhook({}, body)).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('disabled'),
    );
  });
});

describe('parseWebhookEvent', () => {
  const { provider } = setup();

  it('parses an actionable event', () => {
    expect(
      provider.parseWebhookEvent(
        JSON.stringify({
          type: 'applicantReviewed',
          applicantId: 'a1',
          externalUserId: 'user-1',
          reviewStatus: 'completed',
          reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL' },
        }),
      ),
    ).toEqual({
      providerApplicantId: 'a1',
      externalUserId: 'user-1',
      status: 'finallyRejected',
      rawStatus: 'applicantReviewed:completed',
    });
  });

  it('carries the level and the reject labels when the payload has them', () => {
    expect(
      provider.parseWebhookEvent(
        JSON.stringify({
          type: 'applicantReviewed',
          applicantId: 'a1',
          levelName: 'card-kyc',
          reviewStatus: 'completed',
          reviewResult: {
            reviewAnswer: 'RED',
            reviewRejectType: 'RETRY',
            rejectLabels: ['BAD_SELFIE', 'DOCUMENT_DAMAGED'],
          },
        }),
      ),
    ).toMatchObject({
      status: 'declined',
      levelName: 'card-kyc',
      rejectLabels: ['BAD_SELFIE', 'DOCUMENT_DAMAGED'],
    });
  });

  it('leaves the level and the labels out when absent, empty or not strings', () => {
    for (const reviewResult of [
      { reviewAnswer: 'RED', rejectLabels: [] },
      { reviewAnswer: 'RED', rejectLabels: ['ok', 7] },
      { reviewAnswer: 'RED', rejectLabels: 'BAD' },
      { reviewAnswer: 'RED' },
    ]) {
      const event = provider.parseWebhookEvent(
        JSON.stringify({
          type: 'applicantReviewed',
          applicantId: 'a1',
          levelName: '',
          reviewStatus: 'completed',
          reviewResult,
        }),
      );
      expect(event).not.toHaveProperty('rejectLabels');
      expect(event).not.toHaveProperty('levelName');
    }
  });

  it('reports a non-actionable event with a null status', () => {
    expect(
      provider.parseWebhookEvent(
        JSON.stringify({
          type: 'applicantWorkflowCompleted',
          applicantId: 'a1',
        }),
      ),
    ).toEqual({
      providerApplicantId: 'a1',
      externalUserId: undefined,
      status: null,
      rawStatus: 'applicantWorkflowCompleted:',
    });
  });

  it('returns null for malformed JSON and for a payload without a type or an applicant id', () => {
    expect(provider.parseWebhookEvent('not json')).toBeNull();
    expect(provider.parseWebhookEvent('"a string"')).toBeNull();
    expect(
      provider.parseWebhookEvent(JSON.stringify({ type: 'applicantReviewed' })),
    ).toBeNull();
    expect(
      provider.parseWebhookEvent(JSON.stringify({ applicantId: 'a1' })),
    ).toBeNull();
  });
});

describe('hostedPage', () => {
  it('is the Sumsub page with its CSP and permissions policy', () => {
    expect(setup().provider.hostedPage).toBe(sumsubHostedPage);
  });

  it('builds its own client from config and fetch when none is injected', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ token: 'live', userId: 'u' }),
      text: async () => '',
    })) as unknown as typeof fetch;
    const provider = createSumsubProvider({ config, fetch: fetchImpl });
    await expect(
      provider.createSession('u', { platform: 'WEB' }),
    ).resolves.toMatchObject({
      accessToken: 'live',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
