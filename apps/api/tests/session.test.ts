import type { Tracker } from 'knex-mock-client';
import { createTracker } from 'knex-mock-client';
import { knex } from '../src/db';
import {
  bindApplicantId,
  canTransition,
  createSession,
  getLatestSessionForUser,
  getSessionById,
  getSessionByIdForUser,
  getSessionByProviderApplicantId,
  updateSessionStatus,
} from '../src/session';

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

    it('getLatestSessionForUser orders by createdAt desc and filters by provider', async () => {
      tracker.on.select('VerificationSession').responseOnce([row]);
      await expect(getLatestSessionForUser('user-1', 'mock')).resolves.toEqual(row);
      expect(tracker.history.select[0].sql).toMatch(/order by "createdAt" desc/i);
      tracker.on.select('VerificationSession').responseOnce([]);
      await expect(getLatestSessionForUser('user-1', 'mock')).resolves.toBeNull();
    });
  });

  describe('writes', () => {
    it('updateSessionStatus returns the updated row', async () => {
      tracker.on.update('VerificationSession').response([{ ...row, status: 'approved' }]);
      await expect(updateSessionStatus('session-1', 'approved')).resolves.toMatchObject({
        status: 'approved',
      });
    });

    it('updateSessionStatus throws when nothing was updated', async () => {
      tracker.on.update('VerificationSession').response([]);
      await expect(updateSessionStatus('missing', 'approved')).rejects.toThrow(
        /Verification session not found: missing/
      );
    });

    it('bindApplicantId stores the provider applicant id', async () => {
      tracker.on.update('VerificationSession').response([{ ...row, providerApplicantId: 'a1' }]);
      await expect(bindApplicantId('session-1', 'a1')).resolves.toMatchObject({
        providerApplicantId: 'a1',
      });
      expect(tracker.history.update[0].bindings).toEqual(expect.arrayContaining(['a1']));
    });

    it('bindApplicantId throws when the session vanished', async () => {
      tracker.on.update('VerificationSession').response([]);
      await expect(bindApplicantId('missing', 'a1')).rejects.toThrow(
        /Verification session not found: missing/
      );
    });
  });
});

describe('canTransition', () => {
  it('rejects a no-op transition', () => {
    expect(canTransition('pending', 'pending')).toBe(false);
  });

  it('never leaves a terminal status', () => {
    for (const next of [
      'initial',
      'incomplete',
      'pending',
      'declined',
      'finallyRejected',
    ] as const) {
      expect(canTransition('approved', next)).toBe(false);
    }
    expect(canTransition('finallyRejected', 'approved')).toBe(false);
  });

  it('allows a declined applicant to resubmit and be approved', () => {
    expect(canTransition('declined', 'pending')).toBe(true);
    expect(canTransition('declined', 'approved')).toBe(true);
    expect(canTransition('declined', 'finallyRejected')).toBe(true);
  });

  it('allows the ordinary forward moves', () => {
    expect(canTransition('initial', 'incomplete')).toBe(true);
    expect(canTransition('incomplete', 'pending')).toBe(true);
    expect(canTransition('pending', 'approved')).toBe(true);
  });
});
