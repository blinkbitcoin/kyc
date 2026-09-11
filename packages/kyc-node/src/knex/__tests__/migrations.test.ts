// The programmatic migration source: what it creates, what it drops, that
// it is idempotent, and that Knex's migrator can drive it. The Knex schema
// builder is faked so no Postgres is needed; the table definitions are
// asserted through the builder calls.

import type { Knex } from 'knex';
import {
  createKycMigrationSource,
  KYC_MIGRATIONS,
  runKycMigrations,
} from '../migrations';

// A chainable column builder that records every call
const columnCalls: string[] = [];
const column = (): Record<string, jest.Mock> => {
  const self: Record<string, jest.Mock> = {};
  for (const m of [
    'primary',
    'notNullable',
    'nullable',
    'unique',
    'defaultTo',
    'references',
    'inTable',
    'onDelete',
  ]) {
    self[m] = jest.fn((...args: unknown[]) => {
      columnCalls.push(`${m}(${args.map(String).join(',')})`);
      return self;
    });
  }
  return self;
};

const fakeDb = (existing: string[] = []) => {
  const tables: Record<string, string[]> = {};
  const indexes: Record<string, string[][]> = {};
  const tableBuilder = (name: string) => {
    const cols: string[] = [];
    tables[name] = cols;
    indexes[name] = [];
    const define = (type: string) => (col: string) => {
      cols.push(`${type}:${col}`);
      return column();
    };
    return {
      text: define('text'),
      timestamp: define('timestamp'),
      jsonb: define('jsonb'),
      index: (columns: string[]) => {
        indexes[name].push(columns);
      },
    };
  };
  const alterations: Record<string, string[]> = {};
  const alterBuilder = (name: string) => {
    const ops = (alterations[name] ??= []);
    const record = (op: string) => (columns: string[]) => {
      ops.push(`${op}(${columns.join(',')})`);
    };
    return {
      dropUnique: record('dropUnique'),
      unique: record('unique'),
      index: record('index'),
      dropIndex: record('dropIndex'),
    };
  };
  const schema = {
    hasTable: jest.fn(async (name: string) => existing.includes(name)),
    createTable: jest.fn(async (name: string, cb: (t: unknown) => void) => {
      cb(tableBuilder(name));
    }),
    alterTable: jest.fn(async (name: string, cb: (t: unknown) => void) => {
      cb(alterBuilder(name));
    }),
    dropTableIfExists: jest.fn(async (_name: string) => undefined),
  };
  const db = {
    schema,
    fn: { now: () => 'now()' },
    migrate: { latest: jest.fn(async () => [1, ['m']]) },
  } as unknown as Knex;
  return { db, schema, tables, indexes, alterations };
};

describe('KYC_MIGRATIONS', () => {
  beforeEach(() => {
    columnCalls.length = 0;
  });

  it('creates the VerificationSession and AuditLog tables with their columns and constraints', async () => {
    const { db, schema, tables, indexes } = fakeDb();
    await KYC_MIGRATIONS[0].up(db);
    expect(schema.createTable.mock.calls.map(c => c[0])).toEqual([
      'VerificationSession',
      'AuditLog',
    ]);
    expect(tables.VerificationSession).toEqual([
      'text:id',
      'text:userId',
      'text:provider',
      'text:providerApplicantId',
      'text:levelName',
      'text:locale',
      'text:platform',
      'text:status',
      'timestamp:createdAt',
      'timestamp:updatedAt',
    ]);
    expect(indexes.VerificationSession).toEqual([['userId']]);
    expect(tables.AuditLog).toEqual([
      'text:id',
      'text:sessionId',
      'text:action',
      'timestamp:timestamp',
      'jsonb:metadata',
    ]);
    expect(columnCalls).toEqual(
      expect.arrayContaining([
        'primary()',
        'nullable()',
        'unique()',
        'defaultTo(now())',
        'references(id)',
        'inTable(VerificationSession)',
        'onDelete(CASCADE)',
      ]),
    );
  });

  it('is idempotent: skips tables that already exist', async () => {
    const { db, schema } = fakeDb(['VerificationSession', 'AuditLog']);
    await KYC_MIGRATIONS[0].up(db);
    expect(schema.createTable).not.toHaveBeenCalled();
    const partial = fakeDb(['VerificationSession']);
    await KYC_MIGRATIONS[0].up(partial.db);
    expect(partial.schema.createTable.mock.calls.map(c => c[0])).toEqual([
      'AuditLog',
    ]);
  });

  it('drops AuditLog before VerificationSession on the way down', async () => {
    const { db, schema } = fakeDb(['VerificationSession', 'AuditLog']);
    await KYC_MIGRATIONS[0].down(db);
    expect(schema.dropTableIfExists.mock.calls.map(c => c[0])).toEqual([
      'AuditLog',
      'VerificationSession',
    ]);
  });

  it('keeps the original file-based migration name so existing histories match', () => {
    expect(KYC_MIGRATIONS[0].name).toBe(
      '20260905000000_create_verification_session_and_audit_tables.ts',
    );
  });

  it('lets one applicant stand on many sessions: drops the unique, adds the composite index, and reverses', async () => {
    expect(KYC_MIGRATIONS[1].name).toBe(
      '20260911000000_one_applicant_many_sessions.ts',
    );
    const { db, alterations } = fakeDb(['VerificationSession', 'AuditLog']);
    await KYC_MIGRATIONS[1].up(db);
    expect(alterations.VerificationSession).toEqual([
      'dropUnique(providerApplicantId)',
      'index(provider,providerApplicantId)',
    ]);
    const back = fakeDb(['VerificationSession', 'AuditLog']);
    await KYC_MIGRATIONS[1].down(back.db);
    expect(back.alterations.VerificationSession).toEqual([
      'dropIndex(provider,providerApplicantId)',
      'unique(providerApplicantId)',
    ]);
  });
});

describe('createKycMigrationSource', () => {
  it('exposes the migrations to the Knex migrator in order, by name', async () => {
    const source = createKycMigrationSource();
    const migrations = await source.getMigrations([]);
    expect(migrations).toEqual([...KYC_MIGRATIONS]);
    expect(migrations).not.toBe(KYC_MIGRATIONS);
    expect(source.getMigrationName(migrations[0])).toBe(KYC_MIGRATIONS[0].name);
    expect(await source.getMigration(migrations[0])).toBe(migrations[0]);
  });
});

describe('runKycMigrations', () => {
  it('runs migrate.latest with the source', async () => {
    const { db } = fakeDb();
    await runKycMigrations(db);
    expect(db.migrate.latest).toHaveBeenCalledWith({
      migrationSource: expect.objectContaining({
        getMigrations: expect.any(Function),
      }),
    });
  });
});
