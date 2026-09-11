// @blinkbitcoin/kyc-node/knex - the Postgres side for hosts that keep
// verification sessions in their own database: the Knex implementation of
// the SessionStore port and the schema it needs as a programmatic migration
// source. The host passes its own Knex instance; `knex` is an optional peer
// for the types only (nothing from it is imported at runtime).

export {
  createKycMigrationSource,
  KYC_MIGRATIONS,
  type KycMigration,
  runKycMigrations,
} from './knex/migrations';
export {
  createKnexSessionStore,
  type KnexSessionStoreOptions,
} from './knex/store';
