// The Knex/Postgres implementation of the session store port, for hosts
// that keep verification sessions in their own Postgres. Any Knex instance
// works (a transaction included); the host owns the connection.
//
// The terminal guard is part of the UPDATE statement itself
// (`whereNotIn('status', TERMINAL_STATUSES)`), behind a `FOR UPDATE` read,
// so two concurrent webhook deliveries can never both pass a check and then
// both write.

import type { Knex } from 'knex';
import type { AuditEntry } from '../audit';
import type { Logger } from '../log';
import { consoleLogger } from '../log';
import {
  type ApplicantLookupOptions,
  type NewAuditEntry,
  type NewSession,
  pickSessionForApplicant,
  type SessionRecord,
  type SessionStore,
  type StatusWrite,
} from '../store';
import type { VerificationStatus } from '../types';
import { TERMINAL_STATUSES } from '../types';

export interface KnexSessionStoreOptions {
  logger?: Logger;
}

const SESSIONS = 'VerificationSession';
const AUDIT = 'AuditLog';

export const createKnexSessionStore = (
  db: Knex | Knex.Transaction,
  options: KnexSessionStoreOptions = {},
): SessionStore => {
  const logger = options.logger ?? consoleLogger;

  const getSessionById = async (id: string): Promise<SessionRecord | null> =>
    (await db<SessionRecord>(SESSIONS).where({ id }).first()) ?? null;

  const requireSession = async (id: string): Promise<SessionRecord> => {
    const session = await getSessionById(id);
    if (!session) {
      throw new Error(`Verification session not found: ${id}`);
    }
    return session;
  };

  return {
    // A Knex transaction wraps every write made through the store it yields
    transaction: fn =>
      db.transaction(trx => fn(createKnexSessionStore(trx, options))),

    async createSession(data: NewSession): Promise<SessionRecord> {
      const [session] = await db<SessionRecord>(SESSIONS)
        .insert({
          id: data.id,
          userId: data.userId,
          provider: data.provider,
          platform: data.platform,
          levelName: data.levelName ?? null,
          locale: data.locale ?? null,
          providerApplicantId: data.providerApplicantId ?? null,
          status: 'initial',
        })
        .returning('*');
      return session;
    },

    getSessionById,

    // Ownership check in the query: null when missing OR owned by someone else
    async getSessionByIdForUser(
      id: string,
      userId: string,
    ): Promise<SessionRecord | null> {
      return (
        (await db<SessionRecord>(SESSIONS).where({ id, userId }).first()) ??
        null
      );
    },

    async getSessionByProviderApplicantId(
      providerApplicantId: string,
      lookup: ApplicantLookupOptions = {},
    ): Promise<SessionRecord | null> {
      // One applicant, a handful of sessions at most: fetch them and let the
      // shared rule pick, so the stores cannot drift apart.
      const records = await db<SessionRecord>(SESSIONS)
        .where({ providerApplicantId })
        .orderBy('createdAt', 'desc');
      return pickSessionForApplicant(records, lookup.levelName);
    },

    async getLatestUnboundSessionForUser(
      userId: string,
      provider: string,
    ): Promise<SessionRecord | null> {
      return (
        (await db<SessionRecord>(SESSIONS)
          .where({ userId, provider })
          .whereNull('providerApplicantId')
          .orderBy('createdAt', 'desc')
          .first()) ?? null
      );
    },

    async updateSessionStatus(
      id: string,
      status: VerificationStatus,
    ): Promise<StatusWrite> {
      // Run inside a transaction (the domain does) for the row lock the
      // FOR UPDATE read takes to mean anything.
      const current = await db<SessionRecord>(SESSIONS)
        .where({ id })
        .forUpdate()
        .first();
      if (!current) {
        throw new Error(`Verification session not found: ${id}`);
      }

      const [session] = await db<SessionRecord>(SESSIONS)
        .where({ id })
        .whereNotIn('status', [...TERMINAL_STATUSES])
        .andWhere('status', '<>', status)
        .update({ status, updatedAt: db.fn.now() }, ['*']);

      if (!session) {
        // Zero rows: either the write was a no-op (same status) or the guard
        // refused it. The locked read above says which.
        return {
          outcome:
            current.status === status ? 'unchanged' : 'rejected_terminal',
          previousStatus: current.status,
          session: current,
        };
      }
      return { outcome: 'updated', previousStatus: current.status, session };
    },

    async bindApplicantId(
      id: string,
      providerApplicantId: string,
    ): Promise<SessionRecord> {
      const [session] = await db<SessionRecord>(SESSIONS)
        .where({ id })
        .where(builder =>
          builder
            .whereNull('providerApplicantId')
            .orWhere({ providerApplicantId }),
        )
        .update({ providerApplicantId, updatedAt: db.fn.now() }, ['*']);
      return session ?? requireSession(id);
    },

    async appendAuditEntry(entry: NewAuditEntry): Promise<void> {
      await db(AUDIT).insert(entry);
    },

    // Newest first (the audit trail is queried per session for compliance)
    async listAuditEntries(sessionId: string): Promise<AuditEntry[]> {
      try {
        const logs = await db<AuditEntry>(AUDIT)
          .where({ sessionId })
          .orderBy('timestamp', 'desc');
        return logs.map(log => ({
          id: log.id,
          sessionId: log.sessionId,
          action: log.action,
          timestamp: log.timestamp,
          metadata: (log.metadata as Record<string, unknown> | null) ?? null,
        }));
      } catch (error) {
        // Log without PII (sessionId is an internal UUID) and let the caller decide
        logger.error('Failed to query audit logs:', {
          sessionId,
          error: error instanceof Error ? error.message : 'unknown error',
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    },
  };
};
