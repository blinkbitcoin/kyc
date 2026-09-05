import type { Express } from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../src/app';

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
