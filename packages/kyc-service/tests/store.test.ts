// The service composes the package's Knex store over a client built from
// the env it is handed; the store's behaviour is tested in the package.

import { vi } from 'vitest';

const createKnexClient = vi.fn(() => ({ fake: true }));
vi.mock('../src/db', () => ({
  DATABASE_URL: 'DATABASE_URL',
  createKnexClient: (env: unknown) => createKnexClient(env as never),
}));
vi.mock('@blinkbitcoin/kyc-node/knex', () => ({
  createKnexSessionStore: vi.fn(() => ({ composed: true })),
}));

describe('createStore', () => {
  it('is the package Knex store over a client built from the injected env', async () => {
    const { createKnexSessionStore } = await import('@blinkbitcoin/kyc-node/knex');
    const { createStore } = await import('../src/store');
    const env = { DATABASE_URL: 'postgres://u@h/db' };
    expect(createStore(env)).toEqual({ composed: true });
    expect(createKnexClient).toHaveBeenCalledWith(env);
    expect(createKnexSessionStore).toHaveBeenCalledWith({ fake: true });
    // process.env by default
    createStore();
    expect(createKnexClient).toHaveBeenLastCalledWith(process.env);
  });
});
