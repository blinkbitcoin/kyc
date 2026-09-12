import {
  createMemorySessionStore,
  pickSessionForApplicant,
  type SessionRecord,
  type SessionStore,
} from '../store';

// A clock that advances one second per read, so timestamps are distinct
const ticking = () => {
  let t = Date.UTC(2026, 8, 10);
  return () => new Date((t += 1000));
};

const seed = (
  store: SessionStore,
  id = 'session-1',
  over: {
    userId?: string;
    provider?: string;
    providerApplicantId?: string;
    levelName?: string;
  } = {},
) =>
  store.createSession({
    id,
    userId: 'user-1',
    provider: 'mock',
    platform: 'WEB',
    ...over,
  });

describe('createMemorySessionStore', () => {
  describe('createSession', () => {
    it('stores the record as initial with matching timestamps and null optionals', async () => {
      const store = createMemorySessionStore(ticking());
      const record = await seed(store);
      expect(record).toEqual({
        id: 'session-1',
        userId: 'user-1',
        provider: 'mock',
        platform: 'WEB',
        levelName: null,
        locale: null,
        providerApplicantId: null,
        status: 'initial',
        createdAt: new Date(Date.UTC(2026, 8, 10) + 1000),
        updatedAt: new Date(Date.UTC(2026, 8, 10) + 1000),
      });
      expect(await store.getSessionById('session-1')).toEqual(record);
    });

    it('keeps the optional fields when given, and uses the wall clock by default', async () => {
      const before = Date.now();
      const record = await createMemorySessionStore().createSession({
        id: 's',
        userId: 'u',
        provider: 'sumsub',
        platform: 'IOS',
        levelName: 'basic',
        locale: 'en-US',
        providerApplicantId: 'a1',
      });
      expect(record).toMatchObject({
        levelName: 'basic',
        locale: 'en-US',
        providerApplicantId: 'a1',
      });
      expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('returns copies: mutating a returned record does not touch the store', async () => {
      const store = createMemorySessionStore();
      const created = await seed(store);
      created.status = 'approved';
      const fetched = await store.getSessionById('session-1');
      expect(fetched?.status).toBe('initial');
      fetched!.status = 'declined';
      const owned = await store.getSessionByIdForUser('session-1', 'user-1');
      owned!.status = 'declined';
      expect((await store.getSessionById('session-1'))?.status).toBe('initial');
    });
  });

  describe('reads', () => {
    it('getSessionByIdForUser returns the session for its owner only', async () => {
      const store = createMemorySessionStore();
      await seed(store);
      expect(
        await store.getSessionByIdForUser('session-1', 'user-1'),
      ).toMatchObject({
        id: 'session-1',
      });
      expect(
        await store.getSessionByIdForUser('session-1', 'user-2'),
      ).toBeNull();
      expect(await store.getSessionByIdForUser('nope', 'user-1')).toBeNull();
      expect(await store.getSessionById('nope')).toBeNull();
    });

    it('getSessionByProviderApplicantId finds a bound session, null otherwise', async () => {
      const store = createMemorySessionStore();
      await seed(store, 's1', { providerApplicantId: 'a1' });
      await seed(store, 's2');
      expect((await store.getSessionByProviderApplicantId('a1'))?.id).toBe(
        's1',
      );
      const copy = await store.getSessionByProviderApplicantId('a1');
      copy!.status = 'approved';
      expect((await store.getSessionById('s1'))?.status).toBe('initial');
      expect(await store.getSessionByProviderApplicantId('a2')).toBeNull();
    });

    it('getSessionByProviderApplicantId prefers the event level, then a session in progress, then the newest', async () => {
      const store = createMemorySessionStore(ticking());
      await seed(store, 'l2-done', {
        providerApplicantId: 'a1',
        levelName: 'l2',
      });
      await store.updateSessionStatus('l2-done', 'approved');
      await seed(store, 'card', {
        providerApplicantId: 'a1',
        levelName: 'card',
      });
      await seed(store, 'other', {
        providerApplicantId: 'a2',
        levelName: 'card',
      });
      // the event names a level
      expect(
        (await store.getSessionByProviderApplicantId('a1', { levelName: 'l2' }))
          ?.id,
      ).toBe('l2-done');
      // no level, or an unknown one: the session still in progress
      expect((await store.getSessionByProviderApplicantId('a1'))?.id).toBe(
        'card',
      );
      expect(
        (
          await store.getSessionByProviderApplicantId('a1', {
            levelName: 'zzz',
          })
        )?.id,
      ).toBe('card');
      // everything terminal: the newest
      await store.updateSessionStatus('card', 'finallyRejected');
      expect((await store.getSessionByProviderApplicantId('a1'))?.id).toBe(
        'card',
      );
    });

    it('getLatestUnboundSessionForUser picks the newest unbound session of that provider', async () => {
      const store = createMemorySessionStore(ticking());
      await seed(store, 'old');
      await seed(store, 'newest');
      await seed(store, 'other-user', { userId: 'user-2' });
      await seed(store, 'other-provider', { provider: 'sumsub' });
      await seed(store, 'bound', { providerApplicantId: 'a1' });
      expect(
        (await store.getLatestUnboundSessionForUser('user-1', 'mock'))?.id,
      ).toBe('newest');
      expect(
        (await store.getLatestUnboundSessionForUser('user-1', 'sumsub'))?.id,
      ).toBe('other-provider');
      expect(
        await store.getLatestUnboundSessionForUser('user-3', 'mock'),
      ).toBeNull();
    });
  });

  describe('updateSessionStatus (the conditional write)', () => {
    it('updates a non-terminal session and reports the previous status', async () => {
      const store = createMemorySessionStore(ticking());
      const created = await seed(store);
      const write = await store.updateSessionStatus('session-1', 'pending');
      expect(write).toMatchObject({
        outcome: 'updated',
        previousStatus: 'initial',
        session: { status: 'pending' },
      });
      expect(write.session.updatedAt.getTime()).toBeGreaterThan(
        created.updatedAt.getTime(),
      );
      expect(write.session.createdAt).toEqual(created.createdAt);
      write.session.status = 'approved';
      expect((await store.getSessionById('session-1'))?.status).toBe('pending');
    });

    it('reports unchanged when the stored status already equals the target', async () => {
      const store = createMemorySessionStore();
      await seed(store);
      await store.updateSessionStatus('session-1', 'pending');
      expect(
        await store.updateSessionStatus('session-1', 'pending'),
      ).toMatchObject({
        outcome: 'unchanged',
        previousStatus: 'pending',
      });
    });

    it.each(['approved', 'finallyRejected'] as const)(
      'refuses to move a %s session anywhere (the guard is in the write)',
      async terminal => {
        const store = createMemorySessionStore();
        await seed(store);
        await store.updateSessionStatus('session-1', terminal);
        expect(
          await store.updateSessionStatus('session-1', 'declined'),
        ).toMatchObject({
          outcome: 'rejected_terminal',
          previousStatus: terminal,
          session: { status: terminal },
        });
      },
    );

    it('lets a declined session move on (RETRY rejections may resubmit)', async () => {
      const store = createMemorySessionStore();
      await seed(store);
      await store.updateSessionStatus('session-1', 'declined');
      expect(
        await store.updateSessionStatus('session-1', 'pending'),
      ).toMatchObject({
        outcome: 'updated',
      });
    });

    it('throws for an unknown session', async () => {
      await expect(
        createMemorySessionStore().updateSessionStatus('missing', 'pending'),
      ).rejects.toThrow('Verification session not found: missing');
    });
  });

  describe('bindApplicantId', () => {
    it('binds an unbound session, idempotently', async () => {
      const store = createMemorySessionStore(ticking());
      await seed(store);
      expect(await store.bindApplicantId('session-1', 'a1')).toMatchObject({
        providerApplicantId: 'a1',
      });
      expect(await store.bindApplicantId('session-1', 'a1')).toMatchObject({
        providerApplicantId: 'a1',
      });
      expect(
        (await store.getSessionById('session-1'))?.providerApplicantId,
      ).toBe('a1');
    });

    it('reports the other applicant rather than stealing a session bound to it', async () => {
      const store = createMemorySessionStore();
      await seed(store, 'session-1', { providerApplicantId: 'other' });
      const bound = await store.bindApplicantId('session-1', 'a1');
      expect(bound.providerApplicantId).toBe('other');
      bound.providerApplicantId = 'tampered';
      expect(
        (await store.getSessionById('session-1'))?.providerApplicantId,
      ).toBe('other');
    });

    it('throws for an unknown session', async () => {
      await expect(
        createMemorySessionStore().bindApplicantId('missing', 'a1'),
      ).rejects.toThrow('Verification session not found: missing');
    });
  });

  describe('audit entries', () => {
    it('lists entries newest first, filtered per session, as copies', async () => {
      const store = createMemorySessionStore(ticking());
      await store.appendAuditEntry({
        id: 'a1',
        sessionId: 'session-1',
        action: 'session_created',
        metadata: { provider: 'mock' },
      });
      await store.appendAuditEntry({
        id: 'a2',
        sessionId: 'session-2',
        action: 'session_created',
        metadata: {},
      });
      await store.appendAuditEntry({
        id: 'a3',
        sessionId: 'session-1',
        action: 'status_updated',
        metadata: { source: 'webhook' },
      });

      const entries = await store.listAuditEntries('session-1');
      expect(entries.map(entry => entry.id)).toEqual(['a3', 'a1']);
      expect(entries[0]).toEqual({
        id: 'a3',
        sessionId: 'session-1',
        action: 'status_updated',
        metadata: { source: 'webhook' },
        timestamp: expect.any(Date),
      });
      expect(await store.listAuditEntries('session-3')).toEqual([]);
      entries[0].action = 'tampered';
      expect((await store.listAuditEntries('session-1'))[0].action).toBe(
        'status_updated',
      );
    });
  });

  describe('transaction', () => {
    it('commits the writes and returns the callback result on success', async () => {
      const store = createMemorySessionStore();
      const result = await store.transaction(async tx => {
        const record = await seed(tx);
        await tx.appendAuditEntry({
          id: 'a1',
          sessionId: record.id,
          action: 'session_created',
          metadata: {},
        });
        return record.id;
      });
      expect(result).toBe('session-1');
      expect(await store.getSessionById('session-1')).not.toBeNull();
      expect(await store.listAuditEntries('session-1')).toHaveLength(1);
    });

    it('restores both tables and rethrows when the callback throws', async () => {
      const store = createMemorySessionStore();
      await seed(store, 'session-0');
      await store.appendAuditEntry({
        id: 'a0',
        sessionId: 'session-0',
        action: 'session_created',
        metadata: {},
      });

      await expect(
        store.transaction(async tx => {
          await seed(tx, 'session-1');
          await tx.updateSessionStatus('session-0', 'approved');
          await tx.appendAuditEntry({
            id: 'a1',
            sessionId: 'session-1',
            action: 'session_created',
            metadata: {},
          });
          throw new Error('rollback me');
        }),
      ).rejects.toThrow('rollback me');

      expect(await store.getSessionById('session-1')).toBeNull();
      expect((await store.getSessionById('session-0'))?.status).toBe('initial');
      expect(await store.listAuditEntries('session-1')).toEqual([]);
      expect(await store.listAuditEntries('session-0')).toHaveLength(1);

      // The store keeps working after a rollback
      await seed(store, 'session-2');
      expect(await store.getSessionById('session-2')).not.toBeNull();
    });
  });
});

describe('pickSessionForApplicant', () => {
  const record = (
    id: string,
    createdAt: string,
    over: Partial<SessionRecord> = {},
  ): SessionRecord => ({
    id,
    userId: 'u',
    provider: 'mock',
    providerApplicantId: 'a1',
    levelName: null,
    locale: null,
    platform: 'WEB',
    status: 'initial',
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    ...over,
  });

  it('is null for no records and does not mutate its input', () => {
    expect(pickSessionForApplicant([])).toBeNull();
    const records = [record('a', '2026-01-01'), record('b', '2026-01-02')];
    pickSessionForApplicant(records);
    expect(records.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('takes the newest on the level, else the newest in progress, else the newest', () => {
    const records = [
      record('old-card', '2026-01-01', {
        levelName: 'card',
        status: 'approved',
      }),
      record('l2', '2026-01-02', {
        levelName: 'l2',
        status: 'finallyRejected',
      }),
      record('new-card', '2026-01-03', {
        levelName: 'card',
        status: 'approved',
      }),
    ];
    expect(pickSessionForApplicant(records, 'card')?.id).toBe('new-card');
    expect(pickSessionForApplicant(records, 'l2')?.id).toBe('l2');
    expect(pickSessionForApplicant(records, null)?.id).toBe('new-card');
    expect(
      pickSessionForApplicant(
        [...records, record('pending', '2026-01-01', { status: 'pending' })],
        'nope',
      )?.id,
    ).toBe('pending');
  });
});
