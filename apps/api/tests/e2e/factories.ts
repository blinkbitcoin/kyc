import { randomUUID } from 'crypto';

import type { VerificationSessionRow } from '../../src/session';
import { knex } from './setup';

export const createTestSession = async (
  overrides: Partial<{
    id: string;
    userId: string;
    provider: string;
    providerApplicantId: string | null;
    levelName: string | null;
    platform: string;
    status: string;
  }> = {}
): Promise<VerificationSessionRow> => {
  const [session] = await knex<VerificationSessionRow>('VerificationSession')
    .insert({
      id: overrides.id ?? randomUUID(),
      userId: overrides.userId ?? 'e2e-user',
      provider: overrides.provider ?? 'mock',
      providerApplicantId:
        overrides.providerApplicantId === undefined
          ? `mock-applicant-${randomUUID()}`
          : overrides.providerApplicantId,
      levelName: overrides.levelName ?? null,
      platform: overrides.platform ?? 'WEB',
      status: overrides.status ?? 'initial',
    })
    .returning('*');

  return session;
};

export const auditActions = async (sessionId: string): Promise<string[]> => {
  const rows = await knex<{ action: string }>('AuditLog')
    .where({ sessionId })
    .orderBy('timestamp', 'asc');
  return rows.map((row) => row.action);
};

export const cleanTestData = async (): Promise<void> => {
  await knex.raw('TRUNCATE TABLE "AuditLog", "VerificationSession" CASCADE');
};
