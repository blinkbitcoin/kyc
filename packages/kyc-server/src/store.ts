// The session STORE port: what the domain needs from persistence. A host
// implements it over its database (the reference backend uses Knex/Postgres,
// knex/store.ts); createMemorySessionStore is a complete in-memory
// implementation for tests and for hosts that keep session state elsewhere.
//
// The terminal-state machine is not a rule callers may consult and then act
// on: it is part of `updateSessionStatus` itself, so two concurrent webhook
// deliveries can never both pass a check and then both write. The domain
// (sessions.ts) wraps that conditional write and its audit row in one
// transaction; nothing else calls updateSessionStatus (guard-tested).

import type { AuditEntry } from './audit';
import type { VerificationPlatform, VerificationStatus } from './types';
import { TERMINAL_STATUSES } from './types';

export interface SessionRecord {
  id: string;
  userId: string;
  provider: string;
  providerApplicantId: string | null;
  levelName: string | null;
  locale: string | null;
  platform: string;
  status: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewSession {
  id: string;
  userId: string;
  provider: string;
  platform: VerificationPlatform;
  levelName?: string;
  locale?: string;
  providerApplicantId?: string;
}

export interface NewAuditEntry {
  id: string;
  sessionId: string;
  action: string;
  metadata: Record<string, unknown>;
}

/**
 * Outcome of the conditional status write: `rejected_terminal` means the
 * stored status is terminal and the write was refused.
 */
export type StatusWriteOutcome = 'updated' | 'unchanged' | 'rejected_terminal';

export interface StatusWrite {
  outcome: StatusWriteOutcome;
  /** The status the row held before this write. */
  previousStatus: VerificationStatus;
  /** The row as it stands after this write (unchanged when refused). */
  session: SessionRecord;
}

export interface SessionStore {
  // Run `fn` atomically: every write through the store it receives commits
  // together or not at all
  transaction<T>(fn: (store: SessionStore) => Promise<T>): Promise<T>;

  createSession(data: NewSession): Promise<SessionRecord>;
  getSessionById(id: string): Promise<SessionRecord | null>;
  // Ownership check: null when missing OR owned by someone else (no info leak)
  getSessionByIdForUser(
    id: string,
    userId: string,
  ): Promise<SessionRecord | null>;
  getSessionByProviderApplicantId(
    providerApplicantId: string,
  ): Promise<SessionRecord | null>;
  /**
   * The user's newest UNBOUND session with this provider. Used to bind the
   * first webhook of a Sumsub session, where the applicant id does not exist
   * yet when the session row is written. Sessions that already carry an
   * applicant id are excluded on purpose: without that filter a webhook for a
   * brand-new applicant would rebind (and then drive) a session that already
   * belongs to a different applicant of the same user.
   */
  getLatestUnboundSessionForUser(
    userId: string,
    provider: string,
  ): Promise<SessionRecord | null>;
  /**
   * Conditional status write: the terminal guard IS the write, so a
   * concurrent delivery cannot slip between a check and an update. Throws
   * when the session does not exist.
   */
  updateSessionStatus(
    id: string,
    status: VerificationStatus,
  ): Promise<StatusWrite>;
  /**
   * Bind a provider applicant id, but only to a session that is still unbound
   * (or already bound to this same applicant - binding is idempotent). The row
   * comes back either way: when the session already belongs to a DIFFERENT
   * applicant the write matches nothing and the caller sees that other
   * applicant id, so it can refuse the event instead of stealing the session.
   * Throws when the session does not exist.
   */
  bindApplicantId(
    id: string,
    providerApplicantId: string,
  ): Promise<SessionRecord>;

  appendAuditEntry(entry: NewAuditEntry): Promise<void>;
  // Newest first
  listAuditEntries(sessionId: string): Promise<AuditEntry[]>;
}

// In-memory store. Transactions snapshot both tables and restore them when
// the callback throws, giving the same all-or-nothing guarantee a database
// transaction does.
export const createMemorySessionStore = (
  now: () => Date = () => new Date(),
): SessionStore => {
  let sessions = new Map<string, SessionRecord>();
  let audit: AuditEntry[] = [];

  const require = (id: string): SessionRecord => {
    const record = sessions.get(id);
    if (!record) {
      throw new Error(`Verification session not found: ${id}`);
    }
    return record;
  };

  const store: SessionStore = {
    async transaction(fn) {
      const sessionsBefore = new Map(
        [...sessions].map(([id, record]) => [id, { ...record }]),
      );
      const auditBefore = audit.map(entry => ({ ...entry }));
      try {
        return await fn(store);
      } catch (error) {
        sessions = sessionsBefore;
        audit = auditBefore;
        throw error;
      }
    },

    async createSession(data) {
      const timestamp = now();
      const record: SessionRecord = {
        id: data.id,
        userId: data.userId,
        provider: data.provider,
        platform: data.platform,
        levelName: data.levelName ?? null,
        locale: data.locale ?? null,
        providerApplicantId: data.providerApplicantId ?? null,
        status: 'initial',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      sessions.set(record.id, record);
      return { ...record };
    },

    async getSessionById(id) {
      const record = sessions.get(id);
      return record ? { ...record } : null;
    },

    async getSessionByIdForUser(id, userId) {
      const record = sessions.get(id);
      return record && record.userId === userId ? { ...record } : null;
    },

    async getSessionByProviderApplicantId(providerApplicantId) {
      for (const record of sessions.values()) {
        if (record.providerApplicantId === providerApplicantId) {
          return { ...record };
        }
      }
      return null;
    },

    async getLatestUnboundSessionForUser(userId, provider) {
      const candidates = [...sessions.values()]
        .filter(
          record =>
            record.userId === userId &&
            record.provider === provider &&
            record.providerApplicantId === null,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return candidates.length ? { ...candidates[0] } : null;
    },

    async updateSessionStatus(id, status) {
      const current = require(id);
      if (current.status === status) {
        return {
          outcome: 'unchanged',
          previousStatus: current.status,
          session: { ...current },
        };
      }
      if (TERMINAL_STATUSES.has(current.status)) {
        return {
          outcome: 'rejected_terminal',
          previousStatus: current.status,
          session: { ...current },
        };
      }
      const updated = { ...current, status, updatedAt: now() };
      sessions.set(id, updated);
      return {
        outcome: 'updated',
        previousStatus: current.status,
        session: { ...updated },
      };
    },

    async bindApplicantId(id, providerApplicantId) {
      const current = require(id);
      if (
        current.providerApplicantId !== null &&
        current.providerApplicantId !== providerApplicantId
      ) {
        return { ...current };
      }
      const bound = { ...current, providerApplicantId, updatedAt: now() };
      sessions.set(id, bound);
      return { ...bound };
    },

    async appendAuditEntry(entry) {
      audit.push({ ...entry, timestamp: now() });
    },

    async listAuditEntries(sessionId) {
      return audit
        .filter(entry => entry.sessionId === sessionId)
        .map(entry => ({ ...entry }))
        .reverse();
    },
  };
  return store;
};
