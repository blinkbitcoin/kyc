// The service's policy around the package: helmet, CORS, rate limits, JWT
// auth on GraphQL, and the package router mounted. The routes' own
// semantics are tested in the package.

import type { Express } from 'express';
import type { Tracker } from 'knex-mock-client';
import { createTracker } from 'knex-mock-client';
import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../src/app';
import { knex } from '../src/db';
import { signMockWebhook } from '../src/providers/mock';

describe('createApp', () => {
  let app: Express;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCors = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCors === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = originalCors;
    vi.restoreAllMocks();
  });

  it('serves GET /health', async () => {
    app = await createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('answers the health query over GraphQL with an unauthenticated context', async () => {
    app = await createApp();
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ health { status timestamp } }' });
    expect(res.status).toBe(200);
    expect(res.body.data.health.status).toBe('ok');
  });

  it('tags the active span with the user id when a bearer token is present', async () => {
    // Insecure-dev passthrough (tests/setup.ts): the bearer token IS the userId.
    const { trace } = await import('@opentelemetry/api');
    const setAttributes = vi.fn();
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ setAttributes } as never);
    app = await createApp();
    await request(app)
      .post('/graphql')
      .set('authorization', 'Bearer user-42')
      .send({ query: '{ health { status } }' });
    expect(setAttributes).toHaveBeenCalledWith({ 'enduser.id': 'user-42' });
  });

  it('honours CORS_ALLOWED_ORIGINS on /graphql', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example';
    app = await createApp();
    const res = await request(app)
      .post('/graphql')
      .set('origin', 'https://allowed.example')
      .send({ query: '{ health { status } }' });
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example');
  });

  it('trusts the first proxy and disables introspection in production', async () => {
    process.env.NODE_ENV = 'production';
    app = await createApp();
    expect(app.get('trust proxy')).toBe(1);
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ __schema { queryType { name } } }' });
    expect(res.body.errors?.[0]?.message).toMatch(/introspection/i);
  });
});

describe('the package router, mounted with this service policy', () => {
  let tracker: Tracker;

  beforeAll(() => {
    tracker = createTracker(knex);
  });

  afterEach(() => {
    tracker.reset();
    vi.restoreAllMocks();
  });

  it('serves the hosted page for a stored session, under the page headers', async () => {
    tracker.on.select('VerificationSession').response([
      {
        id: 'session-1',
        userId: 'user-1',
        provider: 'mock',
        providerApplicantId: 'mock-applicant-1',
        levelName: null,
        locale: null,
        platform: 'WEB',
        status: 'initial',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await request(await createApp()).get('/hosted/session-1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.headers['permissions-policy']).toContain('camera=');
    const nonce = res.headers['content-security-policy'].match(/'nonce-([^']+)'/)![1];
    expect(res.text).toContain(`nonce="${nonce}"`);
    expect(res.text).toContain('id="mock-approve"');
  });

  it('404s with the sessionExpired page for an unknown session', async () => {
    tracker.on.select('VerificationSession').response([]);
    const res = await request(await createApp()).get('/hosted/nope');
    expect(res.status).toBe(404);
    expect(res.text).toContain("post('sessionExpired')");
  });

  it('accepts webhooks from the configured provider only, signed', async () => {
    const app = await createApp();
    const body = JSON.stringify({ applicantId: 'mock-applicant-1', status: 'approved' });
    expect((await request(app).post('/webhook/kyc/sumsub').send(body)).status).toBe(404);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unsigned = await request(app)
      .post('/webhook/kyc/mock')
      .set('Content-Type', 'application/json')
      .set('X-Mock-Signature', 'bad')
      .send(body);
    expect(unsigned.status).toBe(401);
    tracker.on.select('VerificationSession').response([]);
    const signed = await request(app)
      .post('/webhook/kyc/mock')
      .set('Content-Type', 'application/json')
      .set('X-Mock-Signature', signMockWebhook(body))
      .send(body);
    expect(signed.status).toBe(200);
    expect(signed.body).toEqual({ received: true, outcome: 'unknown_session' });
  });
});
