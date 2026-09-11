// Backend E2E smoke against a real Postgres: the app boots with sessions on,
// the migration applied, and the health endpoints answer.

import { asJson, envApp, get, graphql } from '../support/app';
import { knex } from './setup';

describe('health (E2E)', () => {
  const app = envApp();

  afterAll(async () => {
    await app.stop();
  });

  it('applied the VerificationSession and AuditLog tables', async () => {
    expect(await knex.schema.hasTable('VerificationSession')).toBe(true);
    expect(await knex.schema.hasTable('AuditLog')).toBe(true);
  });

  it('GET /health is ok and reports both capabilities', async () => {
    const response = await get(app, '/health');
    expect(response.status).toBe(200);
    expect(await asJson(response)).toMatchObject({
      status: 'ok',
      capabilities: ['tokens', 'sessions'],
    });
  });

  it('GraphQL health is ok', async () => {
    const result = await graphql<{ health: { status: string } }>(app, '{ health { status } }');
    expect(result.data?.health.status).toBe('ok');
  });
});
