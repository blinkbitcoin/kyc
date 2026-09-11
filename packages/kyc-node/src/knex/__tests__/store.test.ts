// The Knex store against knex-mock-client: the SQL it emits is the
// contract (the terminal guard lives in the UPDATE, the read before it takes
// the row lock), and every read returns the row or null.

import createKnex from 'knex';
import { createTracker, MockClient, type Tracker } from 'knex-mock-client';
import type { Logger } from '../../log';
import { createKnexSessionStore } from '../store';

// `dialect: 'pg'` makes the mock compile the same SQL the real client does -
// including `FOR UPDATE`, which the dialect-less base compiler cannot emit.
const db = createKnex({ client: MockClient, dialect: 'pg' });

const row = {
  id: 'session-1',
  userId: 'user-1',
  provider: 'mock',
  providerApplicantId: null,
  levelName: null,
  locale: null,
  platform: 'WEB',
  status: 'initial' as const,
  createdAt: new Date('2026-09-06T00:00:00.000Z'),
  updatedAt: new Date('2026-09-06T00:00:00.000Z'),
};

const fakeLogger = (): Logger & { error: jest.Mock } => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('createKnexSessionStore', () => {
  let tracker: Tracker;
  const store = createKnexSessionStore(db);

  beforeAll(() => {
    tracker = createTracker(db);
  });

  afterEach(() => {
    tracker.reset();
    jest.restoreAllMocks();
  });

  describe('createSession', () => {
    it('inserts the row as initial with the given id', async () => {
      tracker.on.insert('VerificationSession').response([row]);
      const created = await store.createSession({
        id: 'session-1',
        userId: 'user-1',
        provider: 'mock',
        platform: 'WEB',
        levelName: 'basic',
        locale: 'en-US',
        providerApplicantId: 'mock-applicant-1',
      });
      expect(created).toEqual(row);
      const [insert] = tracker.history.insert;
      expect(insert.bindings).toEqual(
        expect.arrayContaining([
          'session-1',
          'user-1',
          'mock',
          'WEB',
          'basic',
          'en-US',
          'mock-applicant-1',
          'initial',
        ]),
      );
    });

    it('accepts a session with no level name, locale or applicant id yet', async () => {
      tracker.on.insert('VerificationSession').response([row]);
      await store.createSession({
        id: 'session-1',
        userId: 'user-1',
        provider: 'sumsub',
        platform: 'IOS',
      });
      expect(tracker.history.insert[0].bindings).toEqual(
        expect.arrayContaining([null]),
      );
    });
  });

  describe('reads', () => {
    it('getSessionById returns the row or null', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(store.getSessionById('session-1')).resolves.toEqual(row);
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(store.getSessionById('missing')).resolves.toBeNull();
    });

    it('getSessionByIdForUser scopes the query by owner', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(
        store.getSessionByIdForUser('session-1', 'user-1'),
      ).resolves.toEqual(row);
      expect(tracker.history.select[0].bindings).toEqual(
        expect.arrayContaining(['session-1', 'user-1']),
      );
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(
        store.getSessionByIdForUser('session-1', 'someone-else'),
      ).resolves.toBeNull();
    });

    it('getSessionByProviderApplicantId reads every session of the applicant, newest first, and picks by level', async () => {
      const basic = {
        ...row,
        id: 'basic',
        levelName: 'basic',
        status: 'approved' as const,
      };
      const card = {
        ...row,
        id: 'card',
        levelName: 'card',
        status: 'pending' as const,
      };
      tracker.on.select('VerificationSession').responseOnce([card, basic]);
      await expect(
        store.getSessionByProviderApplicantId('mock-applicant-1', {
          levelName: 'basic',
        }),
      ).resolves.toEqual(basic);
      expect(tracker.history.select[0].sql).toMatch(
        /order by "createdAt" desc/i,
      );
      tracker.on.select('VerificationSession').responseOnce([card, basic]);
      await expect(
        store.getSessionByProviderApplicantId('mock-applicant-1'),
      ).resolves.toEqual(card);
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(
        store.getSessionByProviderApplicantId('nope'),
      ).resolves.toBeNull();
    });

    it('getLatestSessionForUser orders by createdAt desc and filters by user and provider only', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(
        store.getLatestSessionForUser('user-1', 'mock'),
      ).resolves.toEqual(row);
      const { sql, bindings } = tracker.history.select[0];
      expect(sql).toMatch(/order by "createdAt" desc/i);
      expect(sql).not.toMatch(/"providerApplicantId"/);
      expect(bindings).toEqual(expect.arrayContaining(['user-1', 'mock']));
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(
        store.getLatestSessionForUser('user-9', 'mock'),
      ).resolves.toBeNull();
    });

    it('getLatestUnboundSessionForUser orders by createdAt desc, filters by provider and skips bound sessions', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(
        store.getLatestUnboundSessionForUser('user-1', 'mock'),
      ).resolves.toEqual(row);
      expect(tracker.history.select[0].sql).toMatch(
        /order by "createdAt" desc/i,
      );
      expect(tracker.history.select[0].sql).toMatch(
        /"providerApplicantId" is null/i,
      );
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(
        store.getLatestUnboundSessionForUser('user-1', 'mock'),
      ).resolves.toBeNull();
    });
  });

  describe('updateSessionStatus (conditional write)', () => {
    it('carries the terminal guard in the UPDATE itself, behind a locked read', async () => {
      tracker.on.select('VerificationSession').response([row]);
      tracker.on
        .update('VerificationSession')
        .response([{ ...row, status: 'approved' }]);

      await expect(
        store.updateSessionStatus('session-1', 'approved'),
      ).resolves.toMatchObject({
        outcome: 'updated',
        previousStatus: 'initial',
        session: { status: 'approved' },
      });

      const [read] = tracker.history.select;
      expect(read.sql).toMatch(/for update/i);
      const [update] = tracker.history.update;
      expect(update.sql).toMatch(/"status" not in \(\$\d+, \$\d+\)/i);
      expect(update.sql).toMatch(/"status" <> \$\d+/i);
      expect(update.bindings).toEqual(
        expect.arrayContaining(['approved', 'finallyRejected', 'session-1']),
      );
    });

    it('reports rejected_terminal when the guard matched no row', async () => {
      tracker.on
        .select('VerificationSession')
        .response([{ ...row, status: 'approved' }]);
      tracker.on.update('VerificationSession').response([]);
      await expect(
        store.updateSessionStatus('session-1', 'declined'),
      ).resolves.toMatchObject({
        outcome: 'rejected_terminal',
        previousStatus: 'approved',
        session: { status: 'approved' },
      });
    });

    it('reports unchanged when the stored status already equals the target', async () => {
      tracker.on
        .select('VerificationSession')
        .response([{ ...row, status: 'pending' }]);
      tracker.on.update('VerificationSession').response([]);
      await expect(
        store.updateSessionStatus('session-1', 'pending'),
      ).resolves.toMatchObject({
        outcome: 'unchanged',
        previousStatus: 'pending',
      });
    });

    it('throws when the session does not exist', async () => {
      tracker.on.select('VerificationSession').response([]);
      await expect(
        store.updateSessionStatus('missing', 'approved'),
      ).rejects.toThrow(/Verification session not found: missing/);
    });
  });

  describe('bindApplicantId', () => {
    it('binds only while the session is unbound or already this applicant', async () => {
      tracker.on
        .update('VerificationSession')
        .response([{ ...row, providerApplicantId: 'a1' }]);
      await expect(
        store.bindApplicantId('session-1', 'a1'),
      ).resolves.toMatchObject({
        providerApplicantId: 'a1',
      });
      const [update] = tracker.history.update;
      expect(update.sql).toMatch(
        /"providerApplicantId" is null or \("providerApplicantId" = \$\d+\)/i,
      );
      expect(update.bindings).toEqual(expect.arrayContaining(['a1']));
    });

    it('reports the other applicant rather than stealing a session bound to it', async () => {
      tracker.on.update('VerificationSession').response([]);
      tracker.on
        .select('VerificationSession')
        .response([{ ...row, providerApplicantId: 'other' }]);
      await expect(
        store.bindApplicantId('session-1', 'a1'),
      ).resolves.toMatchObject({
        providerApplicantId: 'other',
      });
    });

    it('throws when the session vanished', async () => {
      tracker.on.update('VerificationSession').response([]);
      tracker.on.select('VerificationSession').response([]);
      await expect(store.bindApplicantId('missing', 'a1')).rejects.toThrow(
        /Verification session not found: missing/,
      );
    });
  });

  describe('audit entries', () => {
    it('inserts an entry as given', async () => {
      tracker.on.insert('AuditLog').response([]);
      await store.appendAuditEntry({
        id: 'a1',
        sessionId: 'session-1',
        action: 'session_created',
        metadata: { provider: 'mock' },
      });
      expect(tracker.history.insert[0].bindings).toEqual(
        expect.arrayContaining(['a1', 'session-1', 'session_created']),
      );
    });

    it('lists the rows newest first and normalizes a null metadata column', async () => {
      const timestamp = new Date('2026-09-06T00:00:00.000Z');
      tracker.on.select('AuditLog').response([
        {
          id: 'a1',
          sessionId: 'session-1',
          action: 'session_created',
          timestamp,
          metadata: {},
        },
        {
          id: 'a0',
          sessionId: 'session-1',
          action: 'token_refreshed',
          timestamp,
          metadata: null,
        },
      ]);
      await expect(store.listAuditEntries('session-1')).resolves.toEqual([
        {
          id: 'a1',
          sessionId: 'session-1',
          action: 'session_created',
          timestamp,
          metadata: {},
        },
        {
          id: 'a0',
          sessionId: 'session-1',
          action: 'token_refreshed',
          timestamp,
          metadata: null,
        },
      ]);
      expect(tracker.history.select[0].sql).toMatch(
        /order by "timestamp" desc/i,
      );
    });

    it('logs and rethrows a query failure without leaking the payload', async () => {
      const logger = fakeLogger();
      tracker.on.select('AuditLog').simulateError('connection lost');
      await expect(
        createKnexSessionStore(db, { logger }).listAuditEntries('session-1'),
      ).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to query audit logs:',
        expect.objectContaining({
          sessionId: 'session-1',
          error: expect.stringContaining('connection lost'),
        }),
      );
    });

    it('logs a non-Error failure as unknown, through console by default', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      // A driver that rejects with something that is not an Error
      const odd = (() => ({
        where: () => ({
          orderBy: async () => {
            throw 'boom';
          },
        }),
      })) as unknown as Parameters<typeof createKnexSessionStore>[0];
      await expect(
        createKnexSessionStore(odd).listAuditEntries('session-1'),
      ).rejects.toBe('boom');
      expect(error).toHaveBeenCalledWith(
        'Failed to query audit logs:',
        expect.objectContaining({
          sessionId: 'session-1',
          error: 'unknown error',
        }),
      );
    });
  });

  describe('transaction', () => {
    it('runs the callback with a store bound to a Knex transaction', async () => {
      tracker.on.insert('AuditLog').response([]);
      const result = await store.transaction(async tx => {
        await tx.appendAuditEntry({
          id: 'a1',
          sessionId: 'session-1',
          action: 'session_created',
          metadata: {},
        });
        return 'done';
      });
      expect(result).toBe('done');
      expect(tracker.history.insert).toHaveLength(1);
    });
  });
});
