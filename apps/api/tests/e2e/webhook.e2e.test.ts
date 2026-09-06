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
  it('lets the terminal status win a concurrent pair of deliveries', async () => {
    const session = await createTestSession({ status: 'pending' });

    const outcomes = await Promise.all([
      post(payload(session.providerApplicantId!, 'approved')),
      post(payload(session.providerApplicantId!, 'pending')),
    ]);

    expect(outcomes.map((res) => res.status)).toEqual([200, 200]);
    expect(await statusOf(session.id)).toBe('approved');
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
