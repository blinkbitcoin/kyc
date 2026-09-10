// Covers src/__mocks__/db.ts, the automock fixture tests/setup.ts installs
// globally (vi.mock('../src/db')) so repository-layer tests never open a
// real Postgres connection. Nothing in the health-only phase imports
// src/db yet, so this is the only place the fixture module gets executed.

import { MockClient } from 'knex-mock-client';
import { vi } from 'vitest';

describe('src/__mocks__/db (automock fixture)', () => {
  afterEach(() => vi.resetModules());

  it('exports a knex instance backed by the in-memory mock client', async () => {
    const { knex } = await import('../src/db');
    expect(knex.client.config.client).toBe(MockClient);
  });
});
