// The webhook path against a real database: signature, state machine,
// idempotency and the terminal guard.

import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { signMockWebhook } from '../../src/providers/mock';
import { auditActions, cleanTestData, createTestSession } from './factories';
import { knex } from './setup';

describe('webhook (E2E)', () => {
  let app: Express;

  const post = (body: string, signature = signMockWebhook(body)) =>
    request(app)
      .post('/webhook/kyc/mock')
      .set('Content-Type', 'application/json')
      .set('X-Mock-Signature', signature)
      .send(body);

  const payload = (applicantId: string, status: string, externalUserId?: string) =>
    JSON.stringify({ applicantId, status, ...(externalUserId && { externalUserId }) });

  const statusOf = async (id: string): Promise<string> =>
    (await knex('VerificationSession').where({ id }).first()).status;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(async () => {
    await cleanTestData();
  });

  it('rejects an unsigned webhook', async () => {
    const session = await createTestSession();
    const res = await post(payload(session.providerApplicantId!, 'approved'), 'nope');
    expect(res.status).toBe(401);
    expect(await statusOf(session.id)).toBe('initial');
  });

  it('advances the session and writes the audit row', async () => {
    const session = await createTestSession({ status: 'pending' });
    const res = await post(payload(session.providerApplicantId!, 'approved'));

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('updated');
    expect(await statusOf(session.id)).toBe('approved');
    expect(await auditActions(session.id)).toEqual(['status_updated']);
  });

  it('is idempotent for a repeated event', async () => {
    const session = await createTestSession({ status: 'pending' });
    await post(payload(session.providerApplicantId!, 'approved'));
    const res = await post(payload(session.providerApplicantId!, 'approved'));
    expect(res.body.outcome).toBe('unchanged');
    expect(await auditActions(session.id)).toEqual(['status_updated']);
  });

  it('refuses to downgrade an approved session and audits the refusal', async () => {
    const session = await createTestSession({ status: 'approved' });
    const res = await post(payload(session.providerApplicantId!, 'declined'));

    expect(res.body.outcome).toBe('rejected_terminal');
    expect(await statusOf(session.id)).toBe('approved');
    expect(await auditActions(session.id)).toEqual(['webhook_rejected']);
  });

  it('lets a declined applicant resubmit', async () => {
    const session = await createTestSession({ status: 'declined' });
    await post(payload(session.providerApplicantId!, 'pending'));
    expect(await statusOf(session.id)).toBe('pending');
    await post(payload(session.providerApplicantId!, 'approved'));
    expect(await statusOf(session.id)).toBe('approved');
  });

  it('binds the applicant id of a session that had none', async () => {
    const session = await createTestSession({ providerApplicantId: null, status: 'initial' });
    const res = await post(payload('mock-applicant-late', 'pending', session.userId));

    expect(res.body.outcome).toBe('updated');
    const row = await knex('VerificationSession').where({ id: session.id }).first();
    expect(row.providerApplicantId).toBe('mock-applicant-late');
    expect(row.status).toBe('pending');
  });

  it('keeps the terminal status when a late event follows the final one', async () => {
    const session = await createTestSession({ status: 'pending' });
    await post(payload(session.providerApplicantId!, 'approved'));
    const late = await post(payload(session.providerApplicantId!, 'pending'));

    expect(late.body.outcome).toBe('rejected_terminal');
    expect(await statusOf(session.id)).toBe('approved');
    expect(await auditActions(session.id)).toEqual(['status_updated', 'webhook_rejected']);
  });

  // The guard lives in the UPDATE's WHERE clause, so two deliveries racing
  // each other cannot both pass a check and then both write: whichever order
  // the database serializes them in, the terminal status is what survives.
  // `pending` -> `pending` (the old test) passes under the buggy
  // check-then-act code too, since there is nothing terminal to race against
  // until one delivery lands. Racing `approved` (terminal) against `declined`
  // (not terminal) from `pending` is discriminating: without the atomic
  // guard, a naive unconditional UPDATE can let whichever transaction
  // commits last win outright, so `declined` can clobber `approved` when it
  // lands second. With the guard, `declined` can only ever win the race, not
  // the outcome - if it commits first it plants a non-terminal status that
  // `approved` (not itself gated on a specific previous status) then
  // overwrites; if it commits second the guard is already closed and it is
  // rejected. Either way the session must end up `approved`, and `declined`
  // must never be the last word.
  it('lets approved win a concurrent race against declined and never lets declined overwrite it', async () => {
    const session = await createTestSession({ status: 'pending' });

    const outcomes = await Promise.all([
      post(payload(session.providerApplicantId!, 'approved')),
      post(payload(session.providerApplicantId!, 'declined')),
    ]);

    expect(outcomes.map((res) => res.status)).toEqual([200, 200]);
    expect(await statusOf(session.id)).toBe('approved');

    const rows = await knex<{ action: string; metadata: Record<string, unknown> }>('AuditLog')
      .where({ sessionId: session.id })
      .orderBy('timestamp', 'asc');

    const approvedUpdates = rows.filter(
      (row) => row.action === 'status_updated' && row.metadata.status === 'approved'
    );
    expect(approvedUpdates).toHaveLength(1);

    // Exactly one of two legal serializations happened:
    //  - declined landed first (non-terminal, so it wrote), then approved
    //    overwrote it: [status_updated:declined, status_updated:approved]
    //  - approved landed first (terminal), then declined was refused by the
    //    guard: [status_updated:approved, webhook_rejected:terminal_status]
    const declinedFirst =
      rows.length === 2 &&
      rows[0].action === 'status_updated' &&
      rows[0].metadata.status === 'declined' &&
      rows[1].action === 'status_updated' &&
      rows[1].metadata.status === 'approved';

    const approvedFirst =
      rows.length === 2 &&
      rows[0].action === 'status_updated' &&
      rows[0].metadata.status === 'approved' &&
      rows[1].action === 'webhook_rejected' &&
      rows[1].metadata.reason === 'terminal_status';

    expect(declinedFirst || approvedFirst).toBe(true);
  });

  it('binds each applicant to its own unbound session instead of stealing one', async () => {
    const older = await createTestSession({
      providerApplicantId: null,
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
    });
    const newer = await createTestSession({
      providerApplicantId: null,
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
    });

    await post(payload('mock-applicant-first', 'pending', 'e2e-user'));
    await post(payload('mock-applicant-second', 'pending', 'e2e-user'));

    const rows = await knex('VerificationSession').whereIn('id', [older.id, newer.id]);
    const boundIds = rows.map((row) => row.providerApplicantId).sort();
    expect(boundIds).toEqual(['mock-applicant-first', 'mock-applicant-second']);
  });

  it('refuses a webhook whose user has no unbound session left', async () => {
    const session = await createTestSession({ status: 'pending' });
    const res = await post(payload('mock-applicant-other', 'approved', session.userId));

    expect(res.body.outcome).toBe('unknown_session');
    expect(await statusOf(session.id)).toBe('pending');
    expect(
      (await knex('VerificationSession').where({ id: session.id }).first()).providerApplicantId
    ).toBe(session.providerApplicantId);
  });

  it('acknowledges a webhook for a session it does not know', async () => {
    const res = await post(payload('mock-applicant-orphan', 'approved'));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('unknown_session');
  });
});
