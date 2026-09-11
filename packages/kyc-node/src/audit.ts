// The append-only audit trail's vocabulary and its metadata allow-list, so a
// careless caller cannot write applicant names, document data or tokens into
// the compliance log. The stores persist entries (knex/store.ts); the
// service decides what is worth an entry.

import type { VerificationStatus } from './types';

export type AuditAction =
  | 'session_created'
  | 'token_refreshed'
  | 'status_updated'
  | 'webhook_rejected'
  | 'creation_failed'
  | 'effect_failed';

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

/** The metadata with every key outside the allow-list dropped. */
export const sanitizeAuditMetadata = (
  metadata?: AuditMetadata,
): Record<string, unknown> => {
  if (!metadata) {
    return {};
  }
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(metadata)) {
    if (ALLOWED_METADATA_KEYS.has(key)) {
      sanitized[key] = (metadata as Record<string, unknown>)[key];
    }
  }
  return sanitized;
};

export interface AuditEntry {
  id: string;
  sessionId: string;
  action: string;
  timestamp: Date;
  metadata: Record<string, unknown> | null;
}
