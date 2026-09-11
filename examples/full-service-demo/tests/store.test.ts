// The service composes the package's Knex store over its shared client;
// the store's behaviour is tested in the package (knex-mock-client).

import { vi } from 'vitest';

vi.mock('../src/db', () => ({ knex: { fake: true } }));
vi.mock('@blinkbitcoin/kyc-node/knex', () => ({
  createKnexSessionStore: vi.fn(() => ({ composed: true })),
}));

describe('store', () => {
  it('is the package Knex store over the shared knex client', async () => {
    const { createKnexSessionStore } = await import('@blinkbitcoin/kyc-node/knex');
    const { store } = await import('../src/store');
    expect(createKnexSessionStore).toHaveBeenCalledWith({ fake: true });
    expect(store).toEqual({ composed: true });
  });
});
