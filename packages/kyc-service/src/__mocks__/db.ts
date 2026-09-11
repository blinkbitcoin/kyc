// Mock knex client for tests that exercise the repository layer directly
// once one exists (verification sessions, audit log). Backed by
// knex-mock-client so query builders behave like real knex, but hit an
// in-memory tracker instead of Postgres.

import createKnex from 'knex';
import { MockClient } from 'knex-mock-client';

// `dialect: 'pg'` makes the mock compile the same SQL the real client does -
// including `FOR UPDATE`, which the dialect-less base compiler cannot emit.
export const knex = createKnex({ client: MockClient, dialect: 'pg' });
