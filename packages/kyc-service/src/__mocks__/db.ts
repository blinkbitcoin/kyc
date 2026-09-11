// Mock knex client for tests that exercise the repository layer directly
// (verification sessions, audit log). Backed by knex-mock-client so query
// builders behave like real knex, but hit an in-memory tracker instead of
// Postgres. One client for the whole test file: the tracker a test attaches
// must be the one the app's store queries.

import createKnex from 'knex';
import { MockClient } from 'knex-mock-client';

export const DATABASE_URL = 'DATABASE_URL';

// `dialect: 'pg'` makes the mock compile the same SQL the real client does -
// including `FOR UPDATE`, which the dialect-less base compiler cannot emit.
export const knex = createKnex({ client: MockClient, dialect: 'pg' });

export const createKnexClient = () => knex;
