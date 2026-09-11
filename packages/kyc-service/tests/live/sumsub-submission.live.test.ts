// LIVE: an actual verification through the Sumsub sandbox, end to end.
//
// Each test starts a session through the service (a real access token),
// then does what a real user's SDK would - creates the applicant, uploads
// an identity document (Sumsub's own accepted passport template), asks for
// the check - and what the reviewer would: the sandbox-only review answer.
// Sumsub then sends the real `applicantReviewed` webhook to PUBLIC_BASE_URL
// (a laptop with the funnel up receives it; CI has no ingress) and the
// service's status read reconciles against Sumsub either way, so the
// assertions hold in both. What this proves that sumsub.live.test.ts
// cannot: the applicant Sumsub creates is found by external user id and
// bound; a GREEN review approves; a RED/RETRY review declines but stays
// open; a RED/FINAL review is terminal and a later approval is refused.
// docs/integration/sumsub.md rows 3.5-3.8, the state half.
//
// Gated like the other live file: the three SUMSUB_* secrets, DATABASE_URL,
// and an app token allowed to create applicants (`SUMSUB_E2E_LEVEL_NAME`, or
// SUMSUB_LEVEL_NAME, must be a level whose steps a document upload alone
// satisfies - no liveness). Applicants are throwaway sandbox objects named
// kyc-e2e-…; nothing deletes them (docs/operations/live-e2e-ci.md).

import { assertSumsubConfig, sumsubConfigFromEnv } from '@blinkbitcoin/kyc-node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KycApp } from '../../src/app';
import { asJson, get, graphql, post } from '../support/app';
import {
  createSandbox,
  GERMANY_PASSPORT,
  pollUntil,
  type Sandbox,
  type SandboxConfig,
  signWebhook,
  type WebhookDigestAlg,
} from './sumsub-sandbox';

const REQUIRED_ENV = [
  'SUMSUB_APP_TOKEN',
  'SUMSUB_SECRET_KEY',
  'SUMSUB_WEBHOOK_SECRET',
  'DATABASE_URL',
] as const;
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.warn(`[live] Skipping the Sumsub submission tests - missing: ${missing.join(', ')}`);
}

const LEVEL = process.env.SUMSUB_E2E_LEVEL_NAME || process.env.SUMSUB_LEVEL_NAME || '';
const digestAlg = (process.env.SUMSUB_WEBHOOK_DIGEST_ALG || 'HMAC_SHA256_HEX') as WebhookDigestAlg;

// A review answer shows up within seconds; the poll budget is generous
// because the sandbox is shared and the webhook may arrive first or last
const REVIEW_TIMEOUT_MS = 90_000;
const TEST_TIMEOUT_MS = 180_000;
const e2eUser = (what: string): string => `kyc-e2e-${what}-${Date.now()}`;

const START = `
  mutation Start($input: VerificationSessionStartInput!) {
    verificationSessionStart(input: $input) { sessionId status applicantId }
  }
`;
const REFRESH = `
  mutation Refresh($sessionId: ID!) {
    verificationSessionRefresh(sessionId: $sessionId) { accessToken }
  }
`;
const STATUS = `
  query Status($id: ID!) {
    verificationSession(id: $id) { sessionId status applicantId }
  }
`;

describe.runIf(missing.length === 0)('a real applicant through the Sumsub sandbox (live)', () => {
  let app: KycApp;
  let sandbox: Sandbox;
  let knex: ReturnType<typeof import('../../src/db').createKnexClient>;

  // biome-ignore lint/suspicious/noExplicitAny: the GraphQL result shape these tests read, loosely
  const call = async (query: string, variables: object, user: string): Promise<any> =>
    graphql(app, query, variables as Record<string, unknown>, user);

  const sessionStatus = async (sessionId: string, user: string) => {
    const res = await call(STATUS, { id: sessionId }, user);
    expect(res.errors).toBeUndefined();
    return res.data.verificationSession as { status: string; applicantId: string | null };
  };

  /** The audit trail's `status_updated` rows: which path (api | webhook) wrote each status. */
  const statusWrites = async (sessionId: string) => {
    const rows = await knex<{ metadata: { source?: string; status?: string; to?: string } | null }>(
      'AuditLog'
    )
      .where({ sessionId, action: 'status_updated' })
      .orderBy('timestamp', 'asc');
    return rows.map((row) => row.metadata ?? {});
  };

  /** Start a session, create + document + submit its applicant, wait until the service sees it pending. */
  const submit = async (what: string) => {
    const user = e2eUser(what);
    const started = await call(START, { input: { platform: 'IOS' } }, user);
    expect(started.errors).toBeUndefined();
    const { sessionId } = started.data.verificationSessionStart;
    expect(started.data.verificationSessionStart).toMatchObject({
      status: 'initial',
      applicantId: null,
    });

    const applicant = await sandbox.createApplicant(user, LEVEL);
    expect(applicant.externalUserId).toBe(user);
    await sandbox.uploadIdDoc(applicant.id, GERMANY_PASSPORT, 'germany-passport.jpg');
    const steps = await sandbox.stepsStatus(applicant.id);
    expect(steps.IDENTITY?.imageIds?.length ?? 0).toBeGreaterThan(0);
    await sandbox.requestCheck(applicant.id);

    // The status read looks the applicant up by external user id, binds it
    // and maps Sumsub's pending/queued/prechecked to `pending`
    const pending = await pollUntil(
      () => sessionStatus(sessionId, user),
      (s) => s.status === 'pending',
      {
        timeoutMs: REVIEW_TIMEOUT_MS,
        what: 'the session to reach pending',
      }
    );
    expect(pending.applicantId).toBe(applicant.id);
    return { user, sessionId, applicantId: applicant.id };
  };

  const reviewed = (sessionId: string, user: string, status: string) =>
    pollUntil(
      () => sessionStatus(sessionId, user),
      (s) => s.status === status,
      {
        timeoutMs: REVIEW_TIMEOUT_MS,
        what: `the session to reach ${status}`,
      }
    );

  beforeAll(async () => {
    process.env.KYC_PROVIDER = 'sumsub';
    process.env.ALLOW_INSECURE_DEV = 'true';
    delete process.env.JWT_SECRET;
    const config = sumsubConfigFromEnv();
    assertSumsubConfig(config);
    expect(LEVEL, 'SUMSUB_E2E_LEVEL_NAME or SUMSUB_LEVEL_NAME').not.toBe('');
    sandbox = createSandbox(config as SandboxConfig, { log: (line) => console.warn(line) });
    const { envApp } = await import('../support/app');
    app = envApp();
    const { createKnexClient } = await import('../../src/db');
    knex = createKnexClient();
  });

  afterAll(async () => {
    await app?.stop();
    await knex?.destroy();
  });

  it(
    'approves a real applicant: document, check, GREEN review, terminal',
    async () => {
      const { user, sessionId, applicantId } = await submit('green');

      await sandbox.simulateReview(applicantId, 'GREEN');
      const approved = await reviewed(sessionId, user, 'approved');
      expect(approved.applicantId).toBe(applicantId);

      // Every status came through applyStatusTransition: the reconciling
      // read (`api`) or Sumsub's real webhook (`webhook`, funnel up) - the
      // log line says which arrived first
      const writes = await statusWrites(sessionId);
      expect(writes.length).toBeGreaterThan(0);
      for (const write of writes) expect(['api', 'webhook']).toContain(write.source);
      console.warn(`[live] ${writes.map((w) => `${w.status}:${w.source}`).join(' ')}`);

      // Terminal: no more tokens, no more page
      const refreshed = await call(REFRESH, { sessionId }, user);
      expect(refreshed.errors?.[0]?.extensions?.code).toBe('VALIDATION_ERROR');
      expect((await get(app, `/hosted/${sessionId}`)).status).toBe(404);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a retryable rejection declines the session and a later approval still lands',
    async () => {
      const { user, sessionId, applicantId } = await submit('retry');

      await sandbox.simulateReview(applicantId, { red: 'RETRY', labels: ['BAD_PHOTO_QUALITY'] });
      await reviewed(sessionId, user, 'declined');

      // Not terminal: the token still refreshes and the resubmission's approval is taken
      const refreshed = await call(REFRESH, { sessionId }, user);
      expect(refreshed.errors).toBeUndefined();
      await sandbox.simulateReview(applicantId, 'GREEN');
      await reviewed(sessionId, user, 'approved');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a final rejection is terminal: a later approval is answered but never applied',
    async () => {
      const { user, sessionId, applicantId } = await submit('final');

      await sandbox.simulateReview(applicantId, { red: 'FINAL', labels: ['FORGERY'] });
      await reviewed(sessionId, user, 'finallyRejected');

      // What a late or replayed approval from Sumsub would be: signed with
      // the real secret, acknowledged, refused by the terminal guard
      const body = JSON.stringify({
        type: 'applicantReviewed',
        applicantId,
        externalUserId: user,
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
      });
      const { digest, alg } = signWebhook(
        body,
        process.env.SUMSUB_WEBHOOK_SECRET as string,
        digestAlg
      );
      const res = await post(app, '/webhook/kyc/sumsub', body, {
        'x-payload-digest': digest,
        'x-payload-digest-alg': alg,
      });
      expect(res.status).toBe(200);
      expect(await asJson(res)).toMatchObject({ outcome: 'rejected_terminal' });
      expect((await sessionStatus(sessionId, user)).status).toBe('finallyRejected');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'a reset on Sumsub never downgrades an approved session',
    async () => {
      const { user, sessionId, applicantId } = await submit('reset');
      await sandbox.simulateReview(applicantId, 'GREEN');
      await reviewed(sessionId, user, 'approved');

      await sandbox.resetApplicant(applicantId);
      const onSumsub = await sandbox.status(applicantId);
      expect(onSumsub.reviewStatus).toBe('init');
      // Terminal reads skip the provider; a webhook for the reset is refused by the guard
      expect((await sessionStatus(sessionId, user)).status).toBe('approved');
    },
    TEST_TIMEOUT_MS
  );
});
