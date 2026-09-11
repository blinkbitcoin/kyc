// Full GraphQL round trip against a real Postgres and the mock provider.
// ALLOW_INSECURE_DEV=true (.env.test) makes the bearer token the user id.

import { envApp, graphql } from '../support/app';
import { auditActions, cleanTestData } from './factories';
import { knex } from './setup';

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

interface Started {
  verificationSessionStart: {
    sessionId: string;
    provider: string;
    status: string;
    accessToken: string;
    url: string;
    allowedOrigin: string;
    applicantId: string;
  };
}

describe('verification session (E2E)', () => {
  const app = envApp();

  const call = <T = Record<string, unknown>>(query: string, variables: object, user?: string) =>
    graphql<T>(app, query, variables as Record<string, unknown>, user);

  afterAll(async () => {
    await app.stop();
  });

  beforeEach(async () => {
    await cleanTestData();
  });

  it('rejects an unauthenticated start', async () => {
    const res = await call(START, { input: { platform: 'WEB' } });
    expect(res.errors?.[0].extensions?.code).toBe('UNAUTHORIZED');
  });

  it('rejects an unknown platform before touching the database', async () => {
    const res = await call(START, { input: { platform: 'DESKTOP' } }, 'user-1');
    expect(res.errors).toBeDefined();
    expect(await knex('VerificationSession').count({ count: '*' })).toEqual([{ count: '0' }]);
  });

  it('creates a session, persists it and audits it', async () => {
    const res = await call<Started>(
      START,
      { input: { platform: 'IOS', levelName: 'basic-kyc-level', locale: 'en-US' } },
      'user-1'
    );

    const session = res.data!.verificationSessionStart;
    expect(session.provider).toBe('mock');
    expect(session.status).toBe('initial');
    expect(session.accessToken).toMatch(/^mock-token-/);
    expect(session.url).toBe(`http://localhost:5100/hosted/${session.sessionId}`);
    expect(session.allowedOrigin).toBe('http://localhost:5100');
    expect(session.applicantId).toMatch(/^mock-applicant-/);

    const [row] = await knex('VerificationSession').where({ id: session.sessionId });
    expect(row).toMatchObject({
      userId: 'user-1',
      provider: 'mock',
      platform: 'IOS',
      levelName: 'basic-kyc-level',
      locale: 'en-US',
      status: 'initial',
      providerApplicantId: session.applicantId,
    });
    expect(await auditActions(session.sessionId)).toEqual(['session_created']);
  });

  it('rejects a locale that is not a language or language-region tag', async () => {
    const res = await call(START, { input: { platform: 'WEB', locale: 'english' } }, 'user-1');
    expect(res.errors?.[0].extensions?.code).toBe('VALIDATION_ERROR');
    expect(await knex('VerificationSession').count({ count: '*' })).toEqual([{ count: '0' }]);
  });

  it('refreshes the access token and audits it', async () => {
    const start = await call<Started>(START, { input: { platform: 'WEB' } }, 'user-1');
    const { sessionId, accessToken } = start.data!.verificationSessionStart;

    const res = await call<{ verificationSessionRefresh: { accessToken: string } }>(
      REFRESH,
      { sessionId },
      'user-1'
    );
    expect(res.data!.verificationSessionRefresh.accessToken).toMatch(/^mock-token-/);
    expect(res.data!.verificationSessionRefresh.accessToken).not.toBe(accessToken);
    expect(await auditActions(sessionId)).toEqual(['session_created', 'token_refreshed']);
  });

  it('isolates sessions between users', async () => {
    const start = await call<Started>(START, { input: { platform: 'WEB' } }, 'user-1');
    const { sessionId } = start.data!.verificationSessionStart;

    for (const query of [STATUS, REFRESH]) {
      const variables = query === STATUS ? { id: sessionId } : { sessionId };
      const res = await call(query, variables, 'user-2');
      expect(res.errors?.[0].extensions?.code).toBe('SESSION_NOT_FOUND');
    }

    const own = await call<{ verificationSession: { sessionId: string } }>(
      STATUS,
      { id: sessionId },
      'user-1'
    );
    expect(own.data!.verificationSession.sessionId).toBe(sessionId);
  });
});
