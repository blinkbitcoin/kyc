// The service's session store: the package's Knex implementation over the
// shared Knex client (src/db.ts).

import type { SessionStore } from '@blinkbitcoin/kyc-node';
import { createKnexSessionStore } from '@blinkbitcoin/kyc-node/knex';
import { knex } from './db';

export const store: SessionStore = createKnexSessionStore(knex);
