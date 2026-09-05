import type { Knex } from 'knex';

// One row per verification attempt the backend brokered (mode 3), keyed by
// our own id; the provider's applicant id is stored but never exposed over
// GraphQL. Audit rows record lifecycle actions with PII-free metadata.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('VerificationSession'))) {
    await knex.schema.createTable('VerificationSession', (table) => {
      table.text('id').primary();
      table.text('userId').notNullable();
      table.text('provider').notNullable();
      table.text('providerApplicantId').nullable().unique();
      table.text('levelName').nullable();
      table.text('platform').notNullable();
      table.text('status').notNullable();
      table.timestamp('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now());
      table.index(['userId']);
    });
  }

  if (!(await knex.schema.hasTable('AuditLog'))) {
    await knex.schema.createTable('AuditLog', (table) => {
      table.text('id').primary();
      table
        .text('sessionId')
        .notNullable()
        .references('id')
        .inTable('VerificationSession')
        .onDelete('CASCADE');
      table.text('action').notNullable();
      table.timestamp('timestamp', { precision: 3 }).notNullable().defaultTo(knex.fn.now());
      table.jsonb('metadata');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('AuditLog');
  await knex.schema.dropTableIfExists('VerificationSession');
}
