// Backend E2E smoke against a real Postgres: the app boots, the migration
// applied, and the health endpoints answer.

import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { knex } from './setup';

describe('health (E2E)', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  it('applied the VerificationSession and AuditLog tables', async () => {
    expect(await knex.schema.hasTable('VerificationSession')).toBe(true);
    expect(await knex.schema.hasTable('AuditLog')).toBe(true);
  });

  it('GET /health is ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GraphQL health is ok', async () => {
    const res = await request(app).post('/graphql').send({ query: '{ health { status } }' });
    expect(res.body.data.health.status).toBe('ok');
  });
});
