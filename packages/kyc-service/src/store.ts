// The service's session store: the package's Knex implementation over a
// client built from the env the app was handed (src/db.ts). Internal UUIDs
// only - the provider's applicant id never leaves the store's callers.

import type { SessionStore } from '@blinkbitcoin/kyc-node';
import { createKnexSessionStore } from '@blinkbitcoin/kyc-node/knex';
import { createKnexClient } from './db';
import type { Env } from './env';

export const createStore = (env: Env = process.env): SessionStore =>
  createKnexSessionStore(createKnexClient(env));
