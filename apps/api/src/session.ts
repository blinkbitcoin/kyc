// Repository over the VerificationSession table (migration
// 20260905000000), plus the ONE write path every status change goes through.
//
// The terminal-state machine is not a rule callers may consult and then act
// on: it is part of the UPDATE statement itself (`whereNotIn('status',
// TERMINAL_STATUSES)`), so two concurrent webhook deliveries can never both
// pass a check and then both write. `applyStatusTransition` wraps that
// conditional write and its audit row in a single transaction - the webhook
// handler and the resolver reconciliation both call it, and neither can
// bypass the guard.

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';

import { logAuditEvent } from './audit';
import { knex } from './db';
import type { VerificationPlatform, VerificationStatus } from './types';
import { TERMINAL_STATUSES } from './types';

export interface VerificationSessionRow {
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

export interface CreateSessionData {
  userId: string;
  provider: string;
  platform: VerificationPlatform;
  levelName?: string;
  locale?: string;
  providerApplicantId?: string;
}

export const createSession = async (
  data: CreateSessionData,
  trx: Knex | Knex.Transaction = knex
): Promise<VerificationSessionRow> => {
  const [session] = await trx<VerificationSessionRow>('VerificationSession')
    .insert({
      id: randomUUID(),
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
};

export const getSessionById = async (id: string): Promise<VerificationSessionRow | null> =>
  (await knex<VerificationSessionRow>('VerificationSession').where({ id }).first()) ?? null;

/** Ownership check: only returns the row when the user owns it. */
export const getSessionByIdForUser = async (
  id: string,
  userId: string
): Promise<VerificationSessionRow | null> =>
  (await knex<VerificationSessionRow>('VerificationSession').where({ id, userId }).first()) ?? null;

export const getSessionByProviderApplicantId = async (
  providerApplicantId: string
): Promise<VerificationSessionRow | null> =>
  (await knex<VerificationSessionRow>('VerificationSession')
    .where({ providerApplicantId })
    .first()) ?? null;

/**
 * The user's newest UNBOUND session with this provider. Used to bind the
 * first webhook of a Sumsub session, where the applicant id does not exist
 * yet when the session row is written. Sessions that already carry an
 * applicant id are excluded on purpose: without that filter a webhook for a
 * brand-new applicant would rebind (and then drive) a session that already
 * belongs to a different applicant of the same user.
 */
export const getLatestSessionForUser = async (
  userId: string,
  provider: string
): Promise<VerificationSessionRow | null> =>
  (await knex<VerificationSessionRow>('VerificationSession')
    .where({ userId, provider })
    .whereNull('providerApplicantId')
    .orderBy('createdAt', 'desc')
    .first()) ?? null;

/**
 * Outcome of a status write.
 *
 * `rejected_terminal` - the stored status is terminal and the write was
 * refused; `rejected_unbound` - the session is bound to a different
 * applicant than the event claims.
 */
export type StatusTransitionOutcome =
  | 'updated'
  | 'unchanged'
  | 'rejected_terminal'
  | 'rejected_unbound';

export interface StatusTransition {
  outcome: StatusTransitionOutcome;
  /** The status the row held before this write. */
  previousStatus: VerificationStatus;
  /** The row as it stands after this write (unchanged when refused). */
  session: VerificationSessionRow;
}

/**
 * Conditional status write: the terminal guard IS the WHERE clause, so a
 * concurrent delivery cannot slip between a check and an update. Run it
 * inside a transaction (applyStatusTransition does) for the row lock the
 * `FOR UPDATE` read takes to mean anything.
 */
export const updateSessionStatus = async (
  id: string,
  status: VerificationStatus,
  trx: Knex | Knex.Transaction = knex
): Promise<StatusTransition> => {
  const current = await trx<VerificationSessionRow>('VerificationSession')
    .where({ id })
    .forUpdate()
    .first();

  if (!current) {
    throw new Error(`Verification session not found: ${id}`);
  }

  const [session] = await trx<VerificationSessionRow>('VerificationSession')
    .where({ id })
    .whereNotIn('status', [...TERMINAL_STATUSES])
    .andWhere('status', '<>', status)
    .update({ status, updatedAt: trx.fn.now() }, ['*']);

  if (!session) {
    // Zero rows: either the write was a no-op (same status) or the guard
    // refused it. The locked read above says which.
    return {
      outcome: current.status === status ? 'unchanged' : 'rejected_terminal',
      previousStatus: current.status,
      session: current,
    };
  }

  return { outcome: 'updated', previousStatus: current.status, session };
};

const getSessionByIdInTrx = async (
  id: string,
  trx: Knex | Knex.Transaction
): Promise<VerificationSessionRow> => {
  const session = await trx<VerificationSessionRow>('VerificationSession').where({ id }).first();
  if (!session) {
    throw new Error(`Verification session not found: ${id}`);
  }
  return session;
};

/**
 * Bind a provider applicant id, but only to a session that is still unbound
 * (or already bound to this same applicant - binding is idempotent). The row
 * comes back either way: when the session already belongs to a DIFFERENT
 * applicant the write matches nothing and the caller sees that other
 * applicant id, so it can refuse the event instead of stealing the session.
 */
export const bindApplicantId = async (
  id: string,
  providerApplicantId: string,
  trx: Knex | Knex.Transaction = knex
): Promise<VerificationSessionRow> => {
  const [session] = await trx<VerificationSessionRow>('VerificationSession')
    .where({ id })
    .where((builder) => builder.whereNull('providerApplicantId').orWhere({ providerApplicantId }))
    .update({ providerApplicantId, updatedAt: trx.fn.now() }, ['*']);

  return session ?? getSessionByIdInTrx(id, trx);
};

export interface ApplyStatusTransitionOptions {
  /** Applicant id to bind in the same transaction (first webhook of a session). */
  bindApplicantId?: string;
}

/**
 * The shared write path: optional binding, the conditional status update and
 * the matching audit row, all in ONE transaction. Every status change in the
 * backend goes through here.
 */
export const applyStatusTransition = async (
  id: string,
  status: VerificationStatus,
  source: 'api' | 'webhook',
  options: ApplyStatusTransitionOptions = {}
): Promise<StatusTransition> =>
  knex.transaction(async (trx) => {
    if (options.bindApplicantId) {
      const bound = await bindApplicantId(id, options.bindApplicantId, trx);
      if (bound.providerApplicantId !== options.bindApplicantId) {
        await logAuditEvent(
          id,
          'webhook_rejected',
          { status, previousStatus: bound.status, source, reason: 'applicant_mismatch' },
          trx
        );
        return {
          outcome: 'rejected_unbound' as const,
          previousStatus: bound.status,
          session: bound,
        };
      }
    }

    const transition = await updateSessionStatus(id, status, trx);

    if (transition.outcome === 'updated') {
      await logAuditEvent(
        id,
        'status_updated',
        { status, previousStatus: transition.previousStatus, source },
        trx
      );
    } else if (transition.outcome === 'rejected_terminal' && source === 'webhook') {
      // Refusing to un-approve someone is a compliance event, not just a log line.
      await logAuditEvent(
        id,
        'webhook_rejected',
        { status, previousStatus: transition.previousStatus, source, reason: 'terminal_status' },
        trx
      );
    }

    return transition;
  });
