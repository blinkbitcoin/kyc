// Runs ONCE for the whole E2E suite, before any test file is loaded.
//
// Migrating the schema is a database-wide concern, not a per-file one: doing
// it in every file's beforeAll paid the container's cold-start wait N times
// and let a slow first migration blow the hook budget - the flake this file
// removes. Each file still checks connectivity and truncates (tests/e2e/
// setup.ts); only `knex.migrate.latest()` moved here.

import { runKycMigrations } from '@blinkbitcoin/kyc-node/knex';
import type { Knex } from 'knex';
import createKnex from 'knex';

const CONNECT_ATTEMPTS = 15;
const CONNECT_DELAY_MS = 1000;

const waitForDatabase = async (knex: Knex): Promise<void> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    try {
      await knex.raw('SELECT 1');
      return;
    } catch (error) {
      lastError = error as Error;
      await new Promise((resolve) => setTimeout(resolve, CONNECT_DELAY_MS));
    }
  }

  throw new Error(
    `Failed to connect to the E2E database after ${CONNECT_ATTEMPTS} attempts: ${lastError?.message}`
  );
};

export default async function setup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for E2E tests');
  }

  const knex = createKnex({ client: 'pg', connection: connectionString });

  try {
    await waitForDatabase(knex);
    // The schema is the package's programmatic migration source
    await runKycMigrations(knex);
  } finally {
    await knex.destroy();
  }
}
