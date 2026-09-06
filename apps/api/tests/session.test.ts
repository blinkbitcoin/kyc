import type { Tracker } from 'knex-mock-client';
import { createTracker } from 'knex-mock-client';
import { vi } from 'vitest';
import { knex } from '../src/db';
import {
  applyStatusTransition,
  bindApplicantId,
  createSession,
  getLatestSessionForUser,
  getSessionById,
  getSessionByIdForUser,
  getSessionByProviderApplicantId,
  updateSessionStatus,
} from '../src/session';

vi.mock('../src/audit');

const audit = await import('../src/audit');

const row = {
  id: 'session-1',
  userId: 'user-1',
  provider: 'mock',
  providerApplicantId: null,
  levelName: null,
  platform: 'WEB',
  status: 'initial',
  createdAt: new Date('2026-09-06T00:00:00.000Z'),
  updatedAt: new Date('2026-09-06T00:00:00.000Z'),
};

describe('VerificationSession repository', () => {
  let tracker: Tracker;

  beforeAll(() => {
    tracker = createTracker(knex);
  });

  afterEach(() => tracker.reset());

  describe('createSession', () => {
    it('inserts a row with a generated id and the initial status', async () => {
      tracker.on.insert('VerificationSession').response([row]);

      const created = await createSession({
        userId: 'user-1',
        provider: 'mock',
        platform: 'WEB',
        levelName: 'basic',
        providerApplicantId: 'mock-applicant-1',
      });

      expect(created).toEqual(row);
      const [insert] = tracker.history.insert;
      expect(insert.bindings).toEqual(
        expect.arrayContaining(['user-1', 'mock', 'WEB', 'basic', 'mock-applicant-1', 'initial'])
      );
      expect(insert.bindings[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('accepts a session with no level name and no applicant id yet', async () => {
      tracker.on.insert('VerificationSession').response([row]);
      await createSession({ userId: 'user-1', provider: 'sumsub', platform: 'IOS' });
      expect(tracker.history.insert[0].bindings).toEqual(expect.arrayContaining([null]));
    });
  });

  describe('reads', () => {
    it('getSessionById returns the row or null', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(getSessionById('session-1')).resolves.toEqual(row);
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(getSessionById('missing')).resolves.toBeNull();
    });

    it('getSessionByIdForUser scopes the query by owner', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(getSessionByIdForUser('session-1', 'user-1')).resolves.toEqual(row);
      expect(tracker.history.select[0].bindings).toEqual(
        expect.arrayContaining(['session-1', 'user-1'])
      );
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(getSessionByIdForUser('session-1', 'someone-else')).resolves.toBeNull();
    });

    it('getSessionByProviderApplicantId returns the row or null', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(getSessionByProviderApplicantId('mock-applicant-1')).resolves.toEqual(row);
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(getSessionByProviderApplicantId('nope')).resolves.toBeNull();
    });

    it('getLatestSessionForUser orders by createdAt desc, filters by provider and skips bound sessions', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(getLatestSessionForUser('user-1', 'mock')).resolves.toEqual(row);
      expect(tracker.history.select[0].sql).toMatch(/order by "createdAt" desc/i);
      expect(tracker.history.select[0].sql).toMatch(/"providerApplicantId" is null/i);
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(getLatestSessionForUser('user-1', 'mock')).resolves.toBeNull();
    });
  });

  describe('updateSessionStatus (conditional write)', () => {
    it('carries the terminal guard in the UPDATE itself, not in a prior check', async () => {
      tracker.on.select('VerificationSession').response([row]);
      tracker.on.update('VerificationSession').response([{ ...row, status: 'approved' }]);

      await expect(updateSessionStatus('session-1', 'approved')).resolves.toMatchObject({
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
        expect.arrayContaining(['approved', 'finallyRejected', 'session-1'])
      );
    });

    it('reports rejected_terminal when the guard matched no row', async () => {
      tracker.on.select('VerificationSession').response([{ ...row, status: 'approved' }]);
      tracker.on.update('VerificationSession').response([]);

      await expect(updateSessionStatus('session-1', 'declined')).resolves.toMatchObject({
        outcome: 'rejected_terminal',
        previousStatus: 'approved',
        session: { status: 'approved' },
      });
    });

    it('reports unchanged when the stored status already equals the target', async () => {
      tracker.on.select('VerificationSession').response([{ ...row, status: 'pending' }]);
      tracker.on.update('VerificationSession').response([]);

      await expect(updateSessionStatus('session-1', 'pending')).resolves.toMatchObject({
        outcome: 'unchanged',
        previousStatus: 'pending',
      });
    });

    it('throws when the session does not exist', async () => {
      tracker.on.select('VerificationSession').response([]);
      await expect(updateSessionStatus('missing', 'approved')).rejects.toThrow(
        /Verification session not found: missing/
      );
    });
  });

  describe('bindApplicantId', () => {
    it('binds only while the session is unbound or already this applicant', async () => {
      tracker.on.update('VerificationSession').response([{ ...row, providerApplicantId: 'a1' }]);
      await expect(bindApplicantId('session-1', 'a1')).resolves.toMatchObject({
        providerApplicantId: 'a1',
      });
      const [update] = tracker.history.update;
      expect(update.sql).toMatch(
        /"providerApplicantId" is null or \("providerApplicantId" = \$\d+\)/i
      );
      expect(update.bindings).toEqual(expect.arrayContaining(['a1']));
    });

    it('reports the other applicant rather than stealing a session bound to it', async () => {
      tracker.on.update('VerificationSession').response([]);
      tracker.on.select('VerificationSession').response([{ ...row, providerApplicantId: 'other' }]);
      await expect(bindApplicantId('session-1', 'a1')).resolves.toMatchObject({
        providerApplicantId: 'other',
      });
    });

    it('throws when the session vanished', async () => {
      tracker.on.update('VerificationSession').response([]);
      tracker.on.select('VerificationSession').response([]);
      await expect(bindApplicantId('missing', 'a1')).rejects.toThrow(
        /Verification session not found: missing/
      );
    });
  });

  describe('applyStatusTransition', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(knex, 'transaction').mockImplementation(
        // biome-ignore lint/suspicious/noExplicitAny: knex's transaction overloads
        (async (fn: any) => fn(knex)) as any
      );
    });

    afterEach(() => vi.restoreAllMocks());

    it('writes the status and its audit row in one transaction', async () => {
      tracker.on.select('VerificationSession').response([row]);
      tracker.on.update('VerificationSession').response([{ ...row, status: 'pending' }]);

      await expect(applyStatusTransition('session-1', 'pending', 'webhook')).resolves.toMatchObject(
        { outcome: 'updated' }
      );
      expect(knex.transaction).toHaveBeenCalled();
      expect(audit.logAuditEvent).toHaveBeenCalledWith(
        'session-1',
        'status_updated',
        { status: 'pending', previousStatus: 'initial', source: 'webhook' },
        knex
      );
    });

    it('audits a refused downgrade from a webhook', async () => {
      tracker.on.select('VerificationSession').response([{ ...row, status: 'approved' }]);
      tracker.on.update('VerificationSession').response([]);

      await expect(
        applyStatusTransition('session-1', 'declined', 'webhook')
      ).resolves.toMatchObject({ outcome: 'rejected_terminal' });
      expect(audit.logAuditEvent).toHaveBeenCalledWith(
        'session-1',
        'webhook_rejected',
        {
          status: 'declined',
          previousStatus: 'approved',
          source: 'webhook',
          reason: 'terminal_status',
        },
        knex
      );
    });

    it('does not audit a refused reconciliation from the API', async () => {
      tracker.on.select('VerificationSession').response([{ ...row, status: 'approved' }]);
      tracker.on.update('VerificationSession').response([]);

      await expect(applyStatusTransition('session-1', 'declined', 'api')).resolves.toMatchObject({
        outcome: 'rejected_terminal',
      });
      expect(audit.logAuditEvent).not.toHaveBeenCalled();
    });

    it('does not audit an unchanged write', async () => {
      tracker.on.select('VerificationSession').response([{ ...row, status: 'pending' }]);
      tracker.on.update('VerificationSession').response([]);

      await expect(applyStatusTransition('session-1', 'pending', 'webhook')).resolves.toMatchObject(
        { outcome: 'unchanged' }
      );
      expect(audit.logAuditEvent).not.toHaveBeenCalled();
    });

    it('binds the applicant id in the same transaction', async () => {
      tracker.on
        .update('VerificationSession')
        .responseOnce([{ ...row, providerApplicantId: 'a1' }]);
      tracker.on.select('VerificationSession').response([row]);
      tracker.on.update('VerificationSession').response([{ ...row, status: 'pending' }]);

      await expect(
        applyStatusTransition('session-1', 'pending', 'webhook', { bindApplicantId: 'a1' })
      ).resolves.toMatchObject({ outcome: 'updated' });
    });

    it('refuses and audits an event for a session bound to another applicant', async () => {
      tracker.on.update('VerificationSession').response([]);
      tracker.on.select('VerificationSession').response([{ ...row, providerApplicantId: 'other' }]);

      await expect(
        applyStatusTransition('session-1', 'pending', 'webhook', { bindApplicantId: 'a1' })
      ).resolves.toMatchObject({
        outcome: 'rejected_unbound',
        session: { providerApplicantId: 'other' },
      });

      expect(audit.logAuditEvent).toHaveBeenCalledWith(
        'session-1',
        'webhook_rejected',
        {
          status: 'pending',
          previousStatus: 'initial',
          source: 'webhook',
          reason: 'applicant_mismatch',
        },
        knex
      );
    });
  });
});
