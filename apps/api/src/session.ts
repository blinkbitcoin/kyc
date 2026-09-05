// Repository over the VerificationSession table (migration
// 20260905000000). Data access only, plus the pure transition rule the
// webhook handler and the resolvers share. Callers own transactions and are
// responsible for writing the matching audit row - the same split esign uses
// in apps/api/src/envelope.ts.

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';

import { knex } from './db';
import type { VerificationPlatform, VerificationStatus } from './types';
import { TERMINAL_STATUSES } from './types';

export interface VerificationSessionRow {
  id: string;
  userId: string;
  provider: string;
  providerApplicantId: string | null;
  levelName: string | null;
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
 * The user's newest session with this provider. Used to bind the first
 * webhook of a Sumsub session, where the applicant id does not exist yet
 * when the session row is written.
 */
export const getLatestSessionForUser = async (
  userId: string,
  provider: string
): Promise<VerificationSessionRow | null> =>
  (await knex<VerificationSessionRow>('VerificationSession')
    .where({ userId, provider })
    .orderBy('createdAt', 'desc')
    .first()) ?? null;

export const updateSessionStatus = async (
  id: string,
  status: VerificationStatus,
  trx: Knex | Knex.Transaction = knex
): Promise<VerificationSessionRow> => {
  const [session] = await trx<VerificationSessionRow>('VerificationSession')
    .where({ id })
    .update({ status, updatedAt: trx.fn.now() }, ['*']);

  if (!session) {
    throw new Error(`Verification session not found: ${id}`);
  }

  return session;
};

export const bindApplicantId = async (
  id: string,
  providerApplicantId: string,
  trx: Knex | Knex.Transaction = knex
): Promise<VerificationSessionRow> => {
  const [session] = await trx<VerificationSessionRow>('VerificationSession')
    .where({ id })
    .update({ providerApplicantId, updatedAt: trx.fn.now() }, ['*']);

  if (!session) {
    throw new Error(`Verification session not found: ${id}`);
  }

  return session;
};

/**
 * The terminal-state machine. `approved` and `finallyRejected` are final -
 * a late or replayed webhook can never downgrade them. `declined` is not
 * terminal: a RETRY rejection lets the applicant resubmit, so declined may
 * move on to pending, approved or finallyRejected.
 */
export const canTransition = (current: VerificationStatus, next: VerificationStatus): boolean =>
  current !== next && !TERMINAL_STATUSES.has(current);
