// LIVE verification against the real Sumsub sandbox API.
//
// Opt-in: runs only via `npm run test:live` AND only when the three SUMSUB_*
// secrets are set (typically from packages/kyc-service/.env, written
// by `make sumsub-env`); otherwise every test is skipped. The service round
// trips additionally need DATABASE_URL (`make e2e-live` brings up the E2E
// Postgres). Never part of `npm test` or CI's default jobs.
//
// What this automates from docs/integration/sumsub.md: the app-token auth
// and the access-token contract the native SDK depends on (section 2, and
// the seam of `examples/access-token-demo`), the token refresh, the status
// read for a user who has not opened the SDK yet, the hosted page for a
// real token, and a webhook signed with the real secret and digest
// algorithm walking a session to `approved` (2.5 / 3.6 without a device).
// sumsub-submission.live.test.ts takes it from there with a real applicant
// and real reviews; the device matrix (sections 3-5: camera, liveness, the
// SDK screens) stays manual - CI never drives the Sumsub UI.
//
// The contract checks call the package's client directly, so a mismatch
// fails with Sumsub's raw HTTP status + body instead of the provider's
// mapped error; the round trips go through the service.

import { createSumsubClient, sumsubConfigFromEnv } from '@blinkbitcoin/kyc-node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KycApp } from '../../src/app';
import { asJson, get, graphql, post } from '../support/app';
import { signWebhook, type WebhookDigestAlg } from './sumsub-sandbox';

const REQUIRED_ENV = ['SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY', 'SUMSUB_WEBHOOK_SECRET'] as const;

const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.warn(`[live] Skipping Sumsub live verification - missing: ${missing.join(', ')}`);
}
const hasDatabase = Boolean(process.env.DATABASE_URL);
if (missing.length === 0 && !hasDatabase) {
  console.warn(
    '[live] DATABASE_URL is not set - the service round trips are skipped (make e2e-live brings up the E2E Postgres)'
  );
}

// The dashboard decides which algorithm the webhook is signed with;
// SUMSUB_WEBHOOK_DIGEST_ALG says which one to sign with here.
const digestAlg = (process.env.SUMSUB_WEBHOOK_DIGEST_ALG || 'HMAC_SHA256_HEX') as WebhookDigestAlg;

const config = sumsubConfigFromEnv();
const liveUser = (what: string): string => `live-${what}-${Date.now()}`;

describe.runIf(missing.length === 0)('Sumsub API (live, sandbox)', () => {
  const client = createSumsubClient(config);

  it('authenticates with the app token and mints an access token for the level', async () => {
    const userId = liveUser('token');
    const minted = await client.createAccessToken(userId, config.levelName, 60);

    // The contract @blinkbitcoin/kyc-node's provider and the native SDK
    // rely on: the token is a string and Sumsub echoes the external user id
    expect(typeof minted.token).toBe('string');
    expect(minted.token.length).toBeGreaterThan(0);
    expect(minted.userId).toBe(userId);
  });

  it('reports no applicant for a user who never opened the SDK', async () => {
    // What getStatusByUserId turns into `initial`: a token alone creates no
    // applicant, so the external-user-id lookup answers 404
    await expect(client.fetchApplicantByExternalUserId(liveUser('nobody'))).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
  });
});

const START = `
  mutation Start($input: VerificationSessionStartInput!) {
    verificationSessionStart(input: $input) {
      sessionId provider status accessToken url allowedOrigin applicantId
    }
  }
`;

const REFRESH = `
  mutation Refresh($sessionId: ID!) {
    verificationSessionRefresh(sessionId: $sessionId) { accessToken }
  }
`;

const STATUS = `
  query Status($id: ID!) {
    verificationSession(id: $id) { sessionId provider status applicantId }
  }
`;

describe.runIf(missing.length === 0 && hasDatabase)(
  'the service on the Sumsub provider (live, sandbox)',
  () => {
    let app: KycApp;

    // biome-ignore lint/suspicious/noExplicitAny: the GraphQL result shape these tests read, loosely
    const call = async (query: string, variables: object, user?: string): Promise<any> =>
      graphql(app, query, variables as Record<string, unknown>, user);

    beforeAll(async () => {
      // The provider is selected from the env the app is handed. Insecure
      // dev makes the bearer token the user id (no JWT) and keeps the
      // localhost PUBLIC_BASE_URL default; the Sumsub credentials are the
      // real ones.
      process.env.KYC_PROVIDER = 'sumsub';
      process.env.ALLOW_INSECURE_DEV = 'true';
      delete process.env.JWT_SECRET;
      const { envApp } = await import('../support/app');
      app = envApp();
    });

    afterAll(async () => {
      await app?.stop();
    });

    it('starts a session with a real token, refreshes it, reads it back and serves its page', async () => {
      const user = liveUser('session');
      const started = await call(START, { input: { platform: 'IOS' } }, user);
      expect(started.errors).toBeUndefined();
      const session = started.data.verificationSessionStart;
      expect(session.provider).toBe('sumsub');
      expect(session.status).toBe('initial');
      expect(session.accessToken.length).toBeGreaterThan(0);
      // Sumsub creates the applicant when the SDK opens, never at mint time
      expect(session.applicantId).toBeNull();
      expect(session.url).toContain(`/hosted/${session.sessionId}`);

      const refreshed = await call(REFRESH, { sessionId: session.sessionId }, user);
      expect(refreshed.errors).toBeUndefined();
      expect(refreshed.data.verificationSessionRefresh.accessToken.length).toBeGreaterThan(0);

      // Reconciled against Sumsub through the external-user-id lookup: no
      // applicant yet, so the stored `initial` stands
      const status = await call(STATUS, { id: session.sessionId }, user);
      expect(status.data.verificationSession.status).toBe('initial');

      const page = await get(app, `/hosted/${session.sessionId}`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('snsWebSdk');
      expect(page.headers.get('content-security-policy')).toContain('frame-ancestors *');
    });

    it('accepts a webhook signed with the real secret and binds the applicant to the session', async () => {
      const user = liveUser('webhook');
      const started = await call(START, { input: { platform: 'ANDROID' } }, user);
      const { sessionId } = started.data.verificationSessionStart;

      // What Sumsub sends on review, signed the way the dashboard signs it
      // (the secret and the digest algorithm registered there)
      const applicantId = `live-applicant-${Date.now()}`;
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
      expect(await asJson(res)).toMatchObject({ outcome: 'updated' });

      // First webhook of a session created before the applicant existed:
      // found through the external user id, bound, and approved (terminal,
      // so the read needs no provider lookup)
      const status = await call(STATUS, { id: sessionId }, user);
      expect(status.data.verificationSession).toMatchObject({
        status: 'approved',
        applicantId,
      });
    });
  }
);
