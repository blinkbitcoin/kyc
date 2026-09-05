// Append-only audit trail over the AuditLog table. Metadata passes through
// a key allow-list so a careless caller cannot write applicant names,
// document data or tokens into the compliance log (esign's audit.ts, with
// the KYC action vocabulary).
//
// Every row references a VerificationSession (FK, ON DELETE CASCADE), so a
// rejected webhook is only audited once we know which session it targeted.

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';

import { knex } from './db';
import type { VerificationStatus } from './types';

export type AuditAction =
  | 'session_created'
  | 'token_refreshed'
  | 'status_updated'
  | 'webhook_rejected'
  | 'creation_failed';

export interface AuditMetadata {
  userId?: string;
  provider?: string;
  platform?: string;
  levelName?: string;
  status?: VerificationStatus;
  previousStatus?: VerificationStatus;
  source?: 'api' | 'webhook';
  errorCode?: string;
  reason?: string;
}

export const ALLOWED_METADATA_KEYS: ReadonlySet<string> = new Set([
  'userId',
  'provider',
  'platform',
  'levelName',
  'status',
  'previousStatus',
  'source',
  'errorCode',
  'reason',
]);

const sanitizeMetadata = (metadata?: AuditMetadata): Record<string, unknown> => {
  if (!metadata) return {};

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(metadata)) {
    if (ALLOWED_METADATA_KEYS.has(key)) {
      sanitized[key] = (metadata as Record<string, unknown>)[key];
    }
  }
  return sanitized;
};

export const logAuditEvent = async (
  sessionId: string,
  action: AuditAction,
  metadata?: AuditMetadata,
  trx: Knex | Knex.Transaction = knex
): Promise<void> => {
  await trx('AuditLog').insert({
    id: randomUUID(),
    sessionId,
    action,
    metadata: sanitizeMetadata(metadata),
  });
};

export interface AuditLogEntry {
  id: string;
  sessionId: string;
  action: string;
  timestamp: Date;
  metadata: Record<string, unknown> | null;
}

/** Compliance requirement: the trail must be queryable per session. */
export const getAuditLogsBySessionId = async (sessionId: string): Promise<AuditLogEntry[]> => {
  try {
    const logs = await knex<AuditLogEntry>('AuditLog')
      .where({ sessionId })
      .orderBy('timestamp', 'desc');

    return logs.map((log) => ({
      id: log.id,
      sessionId: log.sessionId,
      action: log.action,
      timestamp: log.timestamp,
      metadata: (log.metadata as Record<string, unknown> | null) ?? null,
    }));
  } catch (error) {
    console.error('Failed to query audit logs:', {
      sessionId,
      /* v8 ignore next -- knex/pg always reject with an Error instance; this is an unreachable defensive fallback */
      error: error instanceof Error ? error.message : 'unknown error',
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};
