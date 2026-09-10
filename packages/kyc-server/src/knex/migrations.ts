// The schema the Knex store needs, as a programmatic Knex migration source:
// hosts run `db.migrate.latest({ migrationSource: createKycMigrationSource() })`
// (or `runKycMigrations(db)`) and need no migration files, no TypeScript
// loader and no knexfile. Migration names are stable so a database migrated
// from the original files keeps its knex_migrations history.

import type { Knex } from 'knex';

export interface KycMigration {
  name: string;
  up(db: Knex): Promise<void>;
  down(db: Knex): Promise<void>;
}

// One row per verification attempt the backend brokered, keyed by our own
// id. The provider's applicant id IS exposed over GraphQL (as `applicantId`
// on the session payload - a client needs it to talk to the provider SDK);
// what never leaves the backend is the provider's own session/token
// material. Audit rows record lifecycle actions with PII-free metadata.
const createVerificationSessionAndAuditTables: KycMigration = {
  name: '20260905000000_create_verification_session_and_audit_tables.ts',
  async up(db) {
    if (!(await db.schema.hasTable('VerificationSession'))) {
      await db.schema.createTable('VerificationSession', table => {
        table.text('id').primary();
        table.text('userId').notNullable();
        table.text('provider').notNullable();
        table.text('providerApplicantId').nullable().unique();
        table.text('levelName').nullable();
        table.text('locale').nullable();
        table.text('platform').notNullable();
        table.text('status').notNullable();
        table
          .timestamp('createdAt', { precision: 3 })
          .notNullable()
          .defaultTo(db.fn.now());
        table
          .timestamp('updatedAt', { precision: 3 })
          .notNullable()
          .defaultTo(db.fn.now());
        table.index(['userId']);
      });
    }
    if (!(await db.schema.hasTable('AuditLog'))) {
      await db.schema.createTable('AuditLog', table => {
        table.text('id').primary();
        table
          .text('sessionId')
          .notNullable()
          .references('id')
          .inTable('VerificationSession')
          .onDelete('CASCADE');
        table.text('action').notNullable();
        table
          .timestamp('timestamp', { precision: 3 })
          .notNullable()
          .defaultTo(db.fn.now());
        table.jsonb('metadata');
      });
    }
  },
  async down(db) {
    await db.schema.dropTableIfExists('AuditLog');
    await db.schema.dropTableIfExists('VerificationSession');
  },
};

// In order; append new migrations here, never edit a shipped one
export const KYC_MIGRATIONS: readonly KycMigration[] = [
  createVerificationSessionAndAuditTables,
];

export const createKycMigrationSource =
  (): Knex.MigrationSource<KycMigration> => ({
    getMigrations: async () => [...KYC_MIGRATIONS],
    getMigrationName: migration => migration.name,
    getMigration: async migration => migration,
  });

// Applies every pending kyc migration through the host's Knex instance
export const runKycMigrations = (db: Knex): Promise<unknown> =>
  db.migrate.latest({ migrationSource: createKycMigrationSource() });
