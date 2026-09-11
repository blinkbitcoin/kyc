// Applies the package's migrations to DATABASE_URL and exits. `npm run
// migrate` (tsx, loads .env) locally.
import 'dotenv/config';

import { runKycMigrations } from '@blinkbitcoin/kyc-node/knex';
import { knex } from './db';

runKycMigrations(knex)
  .then(async () => {
    console.log('Migrations applied.');
    await knex.destroy();
  })
  .catch(async (error) => {
    console.error('Migration failed:', error);
    await knex.destroy();
    process.exit(1);
  });
