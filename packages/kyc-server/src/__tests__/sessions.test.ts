// The verification service over the memory store and a fake provider: the
// rules the resolvers and handlers rely on, and the one write path every
// status change takes.

import { Errors } from '../errors';
import type { Logger } from '../log';
import type { VerificationProvider } from '../provider';
import {
  createVerificationService,
  publicOrigin,
  type VerificationServiceDeps,
} from '../sessions';
import { createMemorySessionStore, type SessionStore } from '../store';
import type { SpanAttributes, Tracing } from '../tracing';
import type { VerificationStatus } from '../types';

const fakeLogger = (): Logger & {
  log: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
} => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() });

const fakeProvider = (): VerificationProvider & {
  createSession: jest.Mock;
  refreshToken: jest.Mock;
  getStatus: jest.Mock;
} => ({
  createSession: jest.fn().mockResolvedValue({
    accessToken: 'token-1',
    providerApplicantId: 'app-1',
  }),
  refreshToken: jest.fn().mockResolvedValue({ accessToken: 'token-2' }),
  getStatus: jest.fn().mockResolvedValue('pending'),
  verifyWebhook: jest.fn().mockReturnValue(true),
  parseWebhookEvent: jest.fn().mockReturnValue(null),
});

// Ids in order: the session first, then one per audit entry
const sequence = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const setup = (over: Partial<VerificationServiceDeps> = {}) => {
  const provider = over.provider ?? fakeProvider();
  const store =
    over.store ??
    createMemorySessionStore(() => new Date('2026-09-10T10:00:00Z'));
  const logger = fakeLogger();
  const service = createVerificationService({
    provider,
    providerName: 'mock',
    store,
    publicBaseUrl: () => 'https://kyc.example.com',
    logger,
    newId: sequence(),
    ...over,
  });
  return {
    service,
    store,
    logger,
    provider: provider as ReturnType<typeof fakeProvider>,
  };
};

const user = 'user-1';

const codeOf = async (
  promise: Promise<unknown>,
): Promise<string | undefined> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { extensions?: { code?: string } }).extensions?.code;
  }
};

describe('publicOrigin', () => {
  it('is the origin of a URL, or the value itself when unparseable', () => {
    expect(publicOrigin('https://kyc.example.com/base/')).toBe(
      'https://kyc.example.com',
    );
    expect(publicOrigin('not a url')).toBe('not a url');
  });
});

describe('start', () => {
  it('requires a user and validates the input', async () => {
    const { service } = setup();
    expect(await codeOf(service.start(null, { platform: 'WEB' }))).toBe(
      'UNAUTHORIZED',
    );
    expect(
      await codeOf(service.start(user, { platform: 'web' as never })),
    ).toBe('VALIDATION_ERROR');
  });

  it('persists first, audits, mints a token, binds the applicant and returns the hosted url', async () => {
    const { service, store, provider } = setup();
    await expect(
      service.start(user, {
        platform: 'IOS',
        levelName: 'basic',
        locale: 'en',
      }),
    ).resolves.toEqual({
      sessionId: 'id-1',
      provider: 'mock',
      status: 'initial',
      accessToken: 'token-1',
      url: 'https://kyc.example.com/hosted/id-1',
      allowedOrigin: 'https://kyc.example.com',
      applicantId: 'app-1',
    });
    expect(provider.createSession).toHaveBeenCalledWith(user, {
      platform: 'IOS',
      levelName: 'basic',
      locale: 'en',
    });
    expect(await store.getSessionById('id-1')).toMatchObject({
      userId: user,
      provider: 'mock',
      platform: 'IOS',
      levelName: 'basic',
      locale: 'en',
      providerApplicantId: 'app-1',
      status: 'initial',
    });
    expect(await store.listAuditEntries('id-1')).toEqual([
      expect.objectContaining({
        id: 'id-2',
        action: 'session_created',
        metadata: {
          userId: user,
          provider: 'mock',
          platform: 'IOS',
          levelName: 'basic',
        },
      }),
    ]);
  });

  it('leaves the applicant unbound when the provider does not know one yet', async () => {
    const { service, store, provider } = setup();
    provider.createSession.mockResolvedValue({ accessToken: 'sumsub-token' });
    const result = await service.start(user, { platform: 'WEB' });
    expect(result.applicantId).toBeNull();
    expect(
      (await store.getSessionById('id-1'))?.providerApplicantId,
    ).toBeNull();
  });

  it('hands the raw base back as the origin when it is not a URL', async () => {
    const { service } = setup({ publicBaseUrl: () => 'localhost' });
    await expect(
      service.start(user, { platform: 'WEB' }),
    ).resolves.toMatchObject({
      url: 'localhost/hosted/id-1',
      allowedOrigin: 'localhost',
    });
  });

  it('maps a persistence failure to PERSISTENCE_FAILED before touching the provider', async () => {
    const failing: SessionStore = {
      ...createMemorySessionStore(),
      transaction: async () => {
        throw new Error('db down');
      },
    };
    const { service, logger, provider } = setup({ store: failing });
    expect(await codeOf(service.start(user, { platform: 'WEB' }))).toBe(
      'PERSISTENCE_FAILED',
    );
    expect(provider.createSession).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to persist verification session:',
      'db down',
    );
  });

  it('logs a non-Error persistence failure as is', async () => {
    const failing: SessionStore = {
      ...createMemorySessionStore(),
      transaction: async () => {
        throw 'boom';
      },
    };
    const { service, logger } = setup({ store: failing });
    expect(await codeOf(service.start(user, { platform: 'WEB' }))).toBe(
      'PERSISTENCE_FAILED',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to persist verification session:',
      'boom',
    );
  });

  it('audits and rethrows a provider error that already carries a code', async () => {
    const { service, store, provider, logger } = setup();
    provider.createSession.mockRejectedValue(Errors.sessionCreationFailed());
    expect(await codeOf(service.start(user, { platform: 'WEB' }))).toBe(
      'SESSION_CREATION_FAILED',
    );
    expect(await store.listAuditEntries('id-1')).toEqual([
      expect.objectContaining({
        action: 'creation_failed',
        metadata: { errorCode: 'SESSION_CREATION_FAILED', source: 'api' },
      }),
      expect.objectContaining({ action: 'session_created' }),
    ]);
    expect(logger.error).toHaveBeenCalledWith(
      'Verification session creation failed:',
      expect.objectContaining({
        errorCode: 'SESSION_CREATION_FAILED',
        sessionId: 'id-1',
      }),
    );
  });

  it('maps an uncoded provider failure to PROVIDER_UNAVAILABLE', async () => {
    const { service, store, provider } = setup();
    provider.createSession.mockRejectedValue(new Error('socket hang up'));
    expect(await codeOf(service.start(user, { platform: 'WEB' }))).toBe(
      'PROVIDER_UNAVAILABLE',
    );
    expect((await store.listAuditEntries('id-1'))[0].metadata).toEqual({
      errorCode: 'UNKNOWN_ERROR',
      source: 'api',
    });
  });

  it('treats a non-string extensions.code as no code', async () => {
    const { service, provider } = setup();
    provider.createSession.mockRejectedValue({ extensions: { code: 42 } });
    expect(await codeOf(service.start(user, { platform: 'WEB' }))).toBe(
      'PROVIDER_UNAVAILABLE',
    );
  });

  it('annotates the active span with the session id when the host traces', async () => {
    const annotate = jest.fn();
    const tracing: Tracing = {
      withSpan: (_n, _a, fn) => fn({ setAttribute: () => undefined }),
      annotate,
    };
    const { service } = setup({ tracing });
    await service.start(user, { platform: 'WEB' });
    expect(annotate).toHaveBeenCalledWith({ 'kyc.session_id': 'id-1' });
  });

  it('works with a tracing port that cannot annotate', async () => {
    const tracing: Tracing = {
      withSpan: (_n, _a, fn) => fn({ setAttribute: () => undefined }),
    };
    const { service } = setup({ tracing });
    await expect(
      service.start(user, { platform: 'WEB' }),
    ).resolves.toMatchObject({
      sessionId: 'id-1',
    });
  });
});

describe('refresh', () => {
  const started = async (over: Partial<VerificationServiceDeps> = {}) => {
    const s = setup(over);
    await s.service.start(user, { platform: 'ANDROID', levelName: 'basic' });
    return s;
  };

  it('requires a user, a non-empty id and an owned session', async () => {
    const { service } = await started();
    expect(await codeOf(service.refresh(null, 'id-1'))).toBe('UNAUTHORIZED');
    expect(await codeOf(service.refresh(user, '  '))).toBe('VALIDATION_ERROR');
    expect(await codeOf(service.refresh('user-2', 'id-1'))).toBe(
      'SESSION_NOT_FOUND',
    );
    expect(await codeOf(service.refresh(user, 'missing'))).toBe(
      'SESSION_NOT_FOUND',
    );
  });

  it('mints a replacement token for the session platform and level, and audits it', async () => {
    const { service, store, provider } = await started();
    await expect(service.refresh(user, 'id-1')).resolves.toEqual({
      accessToken: 'token-2',
    });
    expect(provider.refreshToken).toHaveBeenCalledWith(
      { userId: user, providerApplicantId: 'app-1' },
      { platform: 'ANDROID', levelName: 'basic' },
    );
    expect((await store.listAuditEntries('id-1'))[0]).toMatchObject({
      action: 'token_refreshed',
      metadata: { userId: user, source: 'api' },
    });
  });

  it('passes no applicant id or level when the session has none', async () => {
    const { service, provider } = setup();
    provider.createSession.mockResolvedValue({ accessToken: 't' });
    await service.start(user, { platform: 'WEB' });
    await service.refresh(user, 'id-1');
    expect(provider.refreshToken).toHaveBeenCalledWith(
      { userId: user, providerApplicantId: undefined },
      { platform: 'WEB', levelName: undefined },
    );
  });

  it('refuses to refresh a terminal session', async () => {
    const { service, provider } = await started();
    await service.applyStatusTransition('id-1', 'approved', 'webhook');
    const error = await service.refresh(user, 'id-1').catch(e => e);
    expect(error.extensions.code).toBe('VALIDATION_ERROR');
    expect(error.message).toMatch(/terminal/);
    expect(provider.refreshToken).not.toHaveBeenCalled();
  });

  it('maps an uncoded provider failure to PROVIDER_UNAVAILABLE and rethrows a coded one', async () => {
    const { service, provider } = await started();
    provider.refreshToken.mockRejectedValueOnce(new Error('timeout'));
    expect(await codeOf(service.refresh(user, 'id-1'))).toBe(
      'PROVIDER_UNAVAILABLE',
    );
    provider.refreshToken.mockRejectedValueOnce(Errors.sessionNotFound());
    expect(await codeOf(service.refresh(user, 'id-1'))).toBe(
      'SESSION_NOT_FOUND',
    );
  });
});

describe('status', () => {
  it('requires a user, a non-empty id and an owned session', async () => {
    const { service } = setup();
    await service.start(user, { platform: 'WEB' });
    expect(await codeOf(service.status(null, 'id-1'))).toBe('UNAUTHORIZED');
    expect(await codeOf(service.status(user, ''))).toBe('VALIDATION_ERROR');
    expect(await codeOf(service.status('user-2', 'id-1'))).toBe(
      'SESSION_NOT_FOUND',
    );
  });

  it('returns the stored status of a terminal session without asking the provider', async () => {
    const { service, provider } = setup();
    await service.start(user, { platform: 'WEB' });
    await service.applyStatusTransition('id-1', 'approved', 'webhook');
    await expect(service.status(user, 'id-1')).resolves.toEqual({
      sessionId: 'id-1',
      provider: 'mock',
      status: 'approved',
      applicantId: 'app-1',
    });
    expect(provider.getStatus).not.toHaveBeenCalled();
  });

  it('reconciles a bound session through getStatus(applicantId) via the shared write', async () => {
    const { service, store, provider } = setup();
    await service.start(user, { platform: 'WEB' });
    provider.getStatus.mockResolvedValue('pending');
    await expect(service.status(user, 'id-1')).resolves.toMatchObject({
      status: 'pending',
    });
    expect(provider.getStatus).toHaveBeenCalledWith('app-1');
    expect((await store.getSessionById('id-1'))?.status).toBe('pending');
    expect((await store.listAuditEntries('id-1'))[0]).toMatchObject({
      action: 'status_updated',
      metadata: { status: 'pending', previousStatus: 'initial', source: 'api' },
    });
  });

  it('keeps the stored status when the lookup fails, and warns with the code', async () => {
    const { service, provider, logger } = setup();
    await service.start(user, { platform: 'WEB' });
    provider.getStatus.mockRejectedValueOnce(new Error('provider down'));
    await expect(service.status(user, 'id-1')).resolves.toMatchObject({
      status: 'initial',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Verification status reconciliation failed:',
      'UNKNOWN_ERROR',
    );
    provider.getStatus.mockRejectedValueOnce(Errors.providerUnavailable());
    await service.status(user, 'id-1');
    expect(logger.warn).toHaveBeenLastCalledWith(
      'Verification status reconciliation failed:',
      'PROVIDER_UNAVAILABLE',
    );
  });

  it('reconciles by user id while no applicant is bound and the provider can look one up', async () => {
    const provider = {
      ...fakeProvider(),
      getStatusByUserId: jest.fn(
        async (): Promise<VerificationStatus> => 'pending',
      ),
    };
    provider.createSession.mockResolvedValue({ accessToken: 't' });
    const { service } = setup({ provider });
    await service.start(user, { platform: 'WEB' });
    await expect(service.status(user, 'id-1')).resolves.toMatchObject({
      status: 'pending',
    });
    expect(provider.getStatusByUserId).toHaveBeenCalledWith(user);
    expect(provider.getStatus).not.toHaveBeenCalled();
  });

  it('does nothing when the provider cannot look a status up by user id', async () => {
    const { service, provider } = setup();
    provider.createSession.mockResolvedValue({ accessToken: 't' });
    await service.start(user, { platform: 'WEB' });
    await expect(service.status(user, 'id-1')).resolves.toMatchObject({
      status: 'initial',
      applicantId: null,
    });
    expect(provider.getStatus).not.toHaveBeenCalled();
  });

  it('reports whatever the conditional write left in the row when it refuses', async () => {
    const { service, provider } = setup();
    await service.start(user, { platform: 'WEB' });
    await service.applyStatusTransition('id-1', 'declined', 'webhook');
    provider.getStatus.mockResolvedValue('declined');
    await expect(service.status(user, 'id-1')).resolves.toMatchObject({
      status: 'declined',
    });
  });
});

describe('handleWebhookEvent', () => {
  const event = (over: Record<string, unknown> = {}) => ({
    providerApplicantId: 'app-1',
    externalUserId: user,
    status: 'approved' as const,
    rawStatus: 'applicantReviewed:completed',
    ...over,
  });

  it('ignores an event with no actionable status, sanitizing what it logs', async () => {
    const { service, logger } = setup();
    await expect(
      service.handleWebhookEvent(
        event({ status: null, rawStatus: 'bad\nstatus' }),
      ),
    ).resolves.toBe('ignored_unknown_status');
    expect(logger.warn).toHaveBeenCalledWith(expect.not.stringContaining('\n'));
  });

  it('applies the event to the bound session through the shared write', async () => {
    const { service, store, logger } = setup();
    await service.start(user, { platform: 'WEB' });
    await expect(service.handleWebhookEvent(event())).resolves.toBe('updated');
    expect((await store.getSessionById('id-1'))?.status).toBe('approved');
    expect((await store.listAuditEntries('id-1'))[0]).toMatchObject({
      action: 'status_updated',
      metadata: {
        status: 'approved',
        previousStatus: 'initial',
        source: 'webhook',
      },
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('updated to approved'),
    );
  });

  it('binds the applicant in the same write on the first webhook of an unbound session', async () => {
    const { service, store, provider } = setup();
    provider.createSession.mockResolvedValue({ accessToken: 't' });
    await service.start(user, { platform: 'WEB' });
    await expect(
      service.handleWebhookEvent(event({ status: 'pending' })),
    ).resolves.toBe('updated');
    expect(await store.getSessionById('id-1')).toMatchObject({
      providerApplicantId: 'app-1',
      status: 'pending',
    });
  });

  it('ignores a webhook for an unknown applicant with no external user id', async () => {
    const { service } = setup();
    await expect(
      service.handleWebhookEvent(event({ externalUserId: undefined })),
    ).resolves.toBe('unknown_session');
  });

  it('ignores a webhook whose external user id has no unbound session', async () => {
    const { service, logger } = setup();
    await expect(service.handleWebhookEvent(event())).resolves.toBe(
      'unknown_session',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown'),
    );
  });

  it('reports an idempotent redelivery as unchanged', async () => {
    const { service } = setup();
    await service.start(user, { platform: 'WEB' });
    await service.handleWebhookEvent(event());
    await expect(service.handleWebhookEvent(event())).resolves.toBe(
      'unchanged',
    );
  });

  it('refuses, audits and logs a downgrade of a terminal session', async () => {
    const { service, store, logger } = setup();
    await service.start(user, { platform: 'WEB' });
    await service.handleWebhookEvent(event());
    await expect(
      service.handleWebhookEvent(event({ status: 'declined' })),
    ).resolves.toBe('rejected_terminal');
    expect((await store.listAuditEntries('id-1'))[0]).toMatchObject({
      action: 'webhook_rejected',
      metadata: {
        status: 'declined',
        previousStatus: 'approved',
        source: 'webhook',
        reason: 'terminal_status',
      },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('is terminal'),
    );
  });

  it('refuses, audits and logs an event whose session was bound to another applicant meanwhile', async () => {
    const store = createMemorySessionStore();
    const provider = fakeProvider();
    provider.createSession.mockResolvedValue({ accessToken: 't' });
    const { service, logger } = setup({ store, provider });
    await service.start(user, { platform: 'WEB' });
    // The unbound session gets bound to someone else between the lookup and
    // the write: model it with a store whose lookup reports it unbound
    const racing: SessionStore = {
      ...store,
      getLatestUnboundSessionForUser: async (userId, providerName) => {
        const session = await store.getLatestUnboundSessionForUser(
          userId,
          providerName,
        );
        await store.bindApplicantId('id-1', 'other');
        return session;
      },
    };
    const raced = createVerificationService({
      provider,
      providerName: 'mock',
      store: racing,
      publicBaseUrl: () => 'https://kyc.example.com',
      logger,
    });
    await expect(
      raced.handleWebhookEvent(event({ status: 'pending' })),
    ).resolves.toBe('rejected_unbound');
    expect((await store.listAuditEntries('id-1'))[0]).toMatchObject({
      action: 'webhook_rejected',
      metadata: { reason: 'applicant_mismatch', source: 'webhook' },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('different provider applicant'),
    );
  });

  it('records the provider, raw status, status, session and outcome on the span', async () => {
    const attributes: SpanAttributes = {};
    const spanNames: string[] = [];
    const tracing: Tracing = {
      withSpan: (name, initial, fn) => {
        spanNames.push(name);
        Object.assign(attributes, initial);
        return fn({
          setAttribute: (key, value) => {
            attributes[key] = value;
          },
        });
      },
    };
    const { service } = setup({ tracing });
    await service.start(user, { platform: 'WEB' });
    await service.handleWebhookEvent(event());
    expect(spanNames).toEqual(['kyc.webhook.process']);
    expect(attributes).toEqual({
      'kyc.provider': 'mock',
      'kyc.webhook.raw_status': 'applicantReviewed:completed',
      'kyc.status': 'approved',
      'kyc.session_id': 'id-1',
      'kyc.webhook.outcome': 'updated',
    });
  });
});

describe('applyStatusTransition', () => {
  it('does not audit a refused reconciliation from the API, nor an unchanged write', async () => {
    const { service, store } = setup();
    await service.start(user, { platform: 'WEB' });
    await service.applyStatusTransition('id-1', 'approved', 'webhook');
    const before = (await store.listAuditEntries('id-1')).length;
    await expect(
      service.applyStatusTransition('id-1', 'declined', 'api'),
    ).resolves.toMatchObject({ outcome: 'rejected_terminal' });
    await expect(
      service.applyStatusTransition('id-1', 'approved', 'webhook'),
    ).resolves.toMatchObject({ outcome: 'unchanged' });
    expect(await store.listAuditEntries('id-1')).toHaveLength(before);
  });

  it('binds the applicant in the same transaction as the status write', async () => {
    const { service, provider } = setup();
    provider.createSession.mockResolvedValue({ accessToken: 't' });
    await service.start(user, { platform: 'WEB' });
    await expect(
      service.applyStatusTransition('id-1', 'pending', 'webhook', {
        bindApplicantId: 'app-9',
      }),
    ).resolves.toMatchObject({
      outcome: 'updated',
      session: { providerApplicantId: 'app-9' },
    });
  });

  it('rolls the binding back when the status write throws', async () => {
    const { service, store, provider } = setup();
    provider.createSession.mockResolvedValue({ accessToken: 't' });
    await service.start(user, { platform: 'WEB' });
    const broken: SessionStore = {
      ...store,
      transaction: fn =>
        store.transaction(tx =>
          fn({
            ...tx,
            updateSessionStatus: async () => {
              throw new Error('write failed');
            },
          }),
        ),
    };
    const s = createVerificationService({
      provider,
      providerName: 'mock',
      store: broken,
      publicBaseUrl: () => 'x',
    });
    await expect(
      s.applyStatusTransition('id-1', 'pending', 'webhook', {
        bindApplicantId: 'app-9',
      }),
    ).rejects.toThrow('write failed');
    expect(
      (await store.getSessionById('id-1'))?.providerApplicantId,
    ).toBeNull();
  });
});

describe('hostedPage', () => {
  it('is not found for a missing session, another provider or a terminal session', async () => {
    const { service, store } = setup();
    await expect(service.hostedPage('missing')).resolves.toEqual({
      kind: 'not_found',
      status: 404,
    });
    await store.createSession({
      id: 'other',
      userId: user,
      provider: 'sumsub',
      platform: 'WEB',
    });
    await expect(service.hostedPage('other')).resolves.toEqual({
      kind: 'not_found',
      status: 404,
    });
    await service.start(user, { platform: 'WEB' });
    await service.applyStatusTransition('id-1', 'approved', 'webhook');
    await expect(service.hostedPage('id-1')).resolves.toEqual({
      kind: 'not_found',
      status: 404,
    });
  });

  it('mints a fresh token per render and hands the session back', async () => {
    const { service, provider } = setup();
    await service.start(user, { platform: 'IOS', levelName: 'basic' });
    await expect(service.hostedPage('id-1')).resolves.toEqual({
      kind: 'page',
      session: expect.objectContaining({
        id: 'id-1',
        providerApplicantId: 'app-1',
      }),
      accessToken: 'token-2',
    });
    expect(provider.refreshToken).toHaveBeenCalledWith(
      { userId: user, providerApplicantId: 'app-1' },
      { platform: 'IOS', levelName: 'basic' },
    );
  });

  it('is a 502 when the token cannot be minted, logging the reason', async () => {
    const { service, provider, logger } = setup();
    provider.createSession.mockResolvedValue({ accessToken: 't' });
    await service.start(user, { platform: 'WEB' });
    provider.refreshToken.mockRejectedValueOnce(new Error('sumsub down'));
    await expect(service.hostedPage('id-1')).resolves.toEqual({
      kind: 'not_found',
      status: 502,
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Hosted page token minting failed:',
      'sumsub down',
    );
    expect(provider.refreshToken).toHaveBeenCalledWith(
      { userId: user, providerApplicantId: undefined },
      { platform: 'WEB', levelName: undefined },
    );
    provider.refreshToken.mockRejectedValueOnce('boom');
    await service.hostedPage('id-1');
    expect(logger.error).toHaveBeenLastCalledWith(
      'Hosted page token minting failed:',
      'boom',
    );
  });
});
