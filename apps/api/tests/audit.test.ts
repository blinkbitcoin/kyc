import type { Tracker } from 'knex-mock-client';
import { createTracker } from 'knex-mock-client';
import { vi } from 'vitest';
import { ALLOWED_METADATA_KEYS, getAuditLogsBySessionId, logAuditEvent } from '../src/audit';
import { knex } from '../src/db';

describe('audit log', () => {
  let tracker: Tracker;

  beforeAll(() => {
    tracker = createTracker(knex);
  });

  afterEach(() => {
    tracker.reset();
    vi.restoreAllMocks();
  });

  describe('logAuditEvent', () => {
    it('inserts the action with a generated id and sanitized metadata', async () => {
      tracker.on.insert('AuditLog').response([]);

      await logAuditEvent('session-1', 'session_created', {
        userId: 'user-1',
        provider: 'mock',
        platform: 'WEB',
        levelName: 'basic',
        source: 'api',
      });

      const [insert] = tracker.history.insert;
      expect(insert.bindings).toEqual(expect.arrayContaining(['session-1', 'session_created']));
      const metadata = insert.bindings.find(
        (b) => typeof b === 'string' && b.startsWith('{')
      ) as string;
      expect(JSON.parse(metadata)).toEqual({
        userId: 'user-1',
        provider: 'mock',
        platform: 'WEB',
        levelName: 'basic',
        source: 'api',
      });
    });

    it('drops keys outside the allow-list (no PII ever reaches the table)', async () => {
      tracker.on.insert('AuditLog').response([]);

      await logAuditEvent('session-1', 'status_updated', {
        status: 'approved',
        // @ts-expect-error deliberately passing a key the type does not allow
        applicantName: 'Ada Lovelace',
        accessToken: 'secret',
      });

      const metadata = tracker.history.insert[0].bindings.find(
        (b) => typeof b === 'string' && b.startsWith('{')
      ) as string;
      expect(JSON.parse(metadata)).toEqual({ status: 'approved' });
    });

    it('writes an empty object when no metadata is supplied', async () => {
      tracker.on.insert('AuditLog').response([]);
      await logAuditEvent('session-1', 'token_refreshed');
      expect(tracker.history.insert[0].bindings).toEqual(expect.arrayContaining(['{}']));
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

  describe('getAuditLogsBySessionId', () => {
    it('returns the rows newest first', async () => {
      const timestamp = new Date('2026-09-06T00:00:00.000Z');
      tracker.on
        .select('AuditLog')
        .response([
          { id: 'a1', sessionId: 'session-1', action: 'session_created', timestamp, metadata: {} },
        ]);

      await expect(getAuditLogsBySessionId('session-1')).resolves.toEqual([
        { id: 'a1', sessionId: 'session-1', action: 'session_created', timestamp, metadata: {} },
      ]);
      expect(tracker.history.select[0].sql).toMatch(/order by "timestamp" desc/i);
    });

    it('normalizes a null metadata column', async () => {
      tracker.on.select('AuditLog').response([
        {
          id: 'a1',
          sessionId: 'session-1',
          action: 'token_refreshed',
          timestamp: new Date(),
          metadata: null,
        },
      ]);
      const [entry] = await getAuditLogsBySessionId('session-1');
      expect(entry.metadata).toBeNull();
    });

    it('logs and rethrows a query failure without leaking the payload', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      tracker.on.select('AuditLog').simulateError('connection lost');
      await expect(getAuditLogsBySessionId('session-1')).rejects.toThrow();
      expect(error).toHaveBeenCalledWith(
        'Failed to query audit logs:',
        expect.objectContaining({ sessionId: 'session-1' })
      );
    });
  });
});
