// Covers src/__mocks__/db.ts, the automock fixture tests/setup.ts installs
// globally (vi.mock('../src/db')) so repository-layer tests never open a
// real Postgres connection.

import { MockClient } from 'knex-mock-client';
import { vi } from 'vitest';

describe('src/__mocks__/db (automock fixture)', () => {
  afterEach(() => vi.resetModules());

  it('hands every caller the one knex instance backed by the in-memory mock client', async () => {
    const { createKnexClient, knex } = await import('../src/db');
    expect(knex.client.config.client).toBe(MockClient);
    expect(createKnexClient({ DATABASE_URL: 'postgres://anything' })).toBe(knex);
  });
});
