// Full GraphQL round trip against a real Postgres and the mock provider.
// ALLOW_INSECURE_DEV=true (.env.test) makes the bearer token the user id.

import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
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

describe('verification session (E2E)', () => {
  let app: Express;

  const call = (query: string, variables: object, user?: string) => {
    const req = request(app).post('/graphql').send({ query, variables });
    return user ? req.set('authorization', `Bearer ${user}`) : req;
  };

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(async () => {
    await cleanTestData();
  });

  it('rejects an unauthenticated start', async () => {
    const res = await call(START, { input: { platform: 'WEB' } });
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHORIZED');
  });

  it('rejects an unknown platform before touching the database', async () => {
    const res = await call(START, { input: { platform: 'DESKTOP' } }, 'user-1');
    expect(res.body.errors).toBeDefined();
    expect(await knex('VerificationSession').count({ count: '*' })).toEqual([{ count: '0' }]);
  });

  it('creates a session, persists it and audits it', async () => {
    const res = await call(
      START,
      { input: { platform: 'IOS', levelName: 'basic-kyc-level', locale: 'en' } },
      'user-1'
    );

    const session = res.body.data.verificationSessionStart;
    expect(session.provider).toBe('mock');
    expect(session.status).toBe('initial');
    expect(session.accessToken).toMatch(/^mock-token-/);
    expect(session.url).toBe(`http://localhost:4000/hosted/${session.sessionId}`);
    expect(session.allowedOrigin).toBe('http://localhost:4000');
    expect(session.applicantId).toMatch(/^mock-applicant-/);

    const [row] = await knex('VerificationSession').where({ id: session.sessionId });
    expect(row).toMatchObject({
      userId: 'user-1',
      provider: 'mock',
      platform: 'IOS',
      levelName: 'basic-kyc-level',
      status: 'initial',
      providerApplicantId: session.applicantId,
    });
    expect(await auditActions(session.sessionId)).toEqual(['session_created']);
  });

  it('refreshes the access token and audits it', async () => {
    const start = await call(START, { input: { platform: 'WEB' } }, 'user-1');
    const { sessionId, accessToken } = start.body.data.verificationSessionStart;

    const res = await call(REFRESH, { sessionId }, 'user-1');
    expect(res.body.data.verificationSessionRefresh.accessToken).toMatch(/^mock-token-/);
    expect(res.body.data.verificationSessionRefresh.accessToken).not.toBe(accessToken);
    expect(await auditActions(sessionId)).toEqual(['session_created', 'token_refreshed']);
  });

  it('isolates sessions between users', async () => {
    const start = await call(START, { input: { platform: 'WEB' } }, 'user-1');
    const { sessionId } = start.body.data.verificationSessionStart;

    for (const query of [STATUS, REFRESH]) {
      const variables = query === STATUS ? { id: sessionId } : { sessionId };
      const res = await call(query, variables, 'user-2');
      expect(res.body.errors[0].extensions.code).toBe('SESSION_NOT_FOUND');
    }

    const own = await call(STATUS, { id: sessionId }, 'user-1');
    expect(own.body.data.verificationSession.sessionId).toBe(sessionId);
  });
});
