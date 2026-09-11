import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BASE_DEFAULT,
  BASE_VAR,
  BLOCK_SLOTS,
  BLOCK_STEP,
  SERVICES,
  baseFrom,
  claimedBase,
  devDatabaseUrl,
  envLines,
  nextFreeBase,
  parseWorktrees,
  portFrom,
  resolvePorts,
  testDatabaseUrl,
  withClaimedBase,
} from './ports.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => readFileSync(join(root, file), 'utf8');

describe('the port table', () => {
  it("starts at 5100 (5000 is everybody else's, 4100 is esign's) and gives each service its own offset", () => {
    expect(BASE_DEFAULT).toBe(5100);
    const offsets = Object.values(SERVICES).map(s => s.offset);
    expect(offsets).toEqual([...offsets.keys()]);
    const names = Object.values(SERVICES).map(s => s.env);
    expect(new Set(names).size).toBe(names.length);
  });

  it('fits a worktree block, and the blocks stay below 6000', () => {
    expect(Object.keys(SERVICES).length).toBeLessThanOrEqual(BLOCK_STEP);
    expect(
      BASE_DEFAULT + BLOCK_SLOTS * BLOCK_STEP + BLOCK_STEP,
    ).toBeLessThanOrEqual(6000);
  });

  it('lists every key in the type declaration', () => {
    const union = read('scripts/lib/ports.d.mts').match(
      /export type ServiceKey =([^;]*);/,
    )[1];
    const declared = [...union.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]);
    expect(declared).toEqual(Object.keys(SERVICES));
  });

  it('resolves the documented defaults', () => {
    expect(resolvePorts({})).toEqual({
      base: 5100,
      api: 5100,
      webHosted: 5101,
      webProxy: 5102,
      token: 5103,
      testDb: 5104,
      devDb: 5105,
    });
    expect(testDatabaseUrl(5104)).toBe(
      'postgresql://test:test@localhost:5104/kyc_test',
    );
    expect(devDatabaseUrl(5305)).toBe(
      'postgresql://dev:dev@localhost:5305/kyc',
    );
  });

  it('moves every service with the base', () => {
    const ports = resolvePorts({ [BASE_VAR]: '5300' });
    expect(ports.base).toBe(5300);
    for (const [key, { offset }] of Object.entries(SERVICES)) {
      expect(ports[key]).toBe(5300 + offset);
    }
  });

  it('lets a service override its own port without moving the others', () => {
    const ports = resolvePorts({ TOKEN_PORT: '5010', KYC_PORT_BASE: '5300' });
    expect(ports.token).toBe(5010);
    expect(ports.api).toBe(5300);
    expect(ports.webProxy).toBe(5302);
  });

  it('ignores an empty variable', () => {
    expect(baseFrom({ [BASE_VAR]: '' })).toBe(BASE_DEFAULT);
    expect(resolvePorts({ KYC_WEB_PORT: '' }).webHosted).toBe(5101);
  });
});

describe('portFrom', () => {
  it.each(['0', '65536', '-1', '1.5', 'abc', ' '])(
    'rejects the malformed value %j',
    value => {
      expect(() => portFrom('KYC_API_PORT', value, 1)).toThrow(
        /KYC_API_PORT must be a port number/,
      );
    },
  );

  it('accepts the edges of the range', () => {
    expect(portFrom('X', '1', 9)).toBe(1);
    expect(portFrom('X', '65535', 9)).toBe(65535);
  });
});

describe('envLines', () => {
  it('exports the base and every service variable with its resolved value', () => {
    expect(envLines({ TOKEN_PORT: '9000' })).toEqual([
      'export KYC_PORT_BASE=5100',
      'export KYC_API_PORT=5100',
      'export KYC_WEB_PORT=5101',
      'export KYC_WEB_PROXY_PORT=5102',
      'export TOKEN_PORT=9000',
      'export KYC_TEST_DB_PORT=5104',
      'export KYC_DEV_DB_PORT=5105',
      'export KYC_TEST_DATABASE_URL=postgresql://test:test@localhost:5104/kyc_test',
      'export KYC_DEV_DATABASE_URL=postgresql://dev:dev@localhost:5105/kyc',
    ]);
  });
});

// The services cannot import this module (a browser tsconfig, a React
// Native bundle, an ES-module example), so each declares its own offset as
// a literal. These checks keep those literals on the table.
describe('the consumers', () => {
  const { base, api, webHosted, webProxy, token, testDb, devDb } = resolvePorts(
    {},
  );

  it.each([
    ['examples/full-service-demo/src/port.ts', `PORT_BASE_DEFAULT = ${base}`],
    [
      'examples/full-service-demo/src/port.ts',
      `PORT_OFFSET = ${SERVICES.api.offset}`,
    ],
    ['examples/access-token-demo/src/index.ts', `PORT_BASE_DEFAULT = ${base}`],
    [
      'examples/access-token-demo/src/index.ts',
      `PORT_OFFSET = ${SERVICES.token.offset}`,
    ],
    ['examples/react-native-demo/src/config.ts', `PORT_BASE_DEFAULT = ${base}`],
    [
      'examples/react-native-demo/src/config.ts',
      `API_OFFSET = ${SERVICES.api.offset}`,
    ],
    [
      'examples/react-demo/vite.config.ts',
      `WEB_OFFSET = ${SERVICES.webHosted.offset}`,
    ],
    ['examples/react-demo/vite.config.ts', `PORT_BASE_DEFAULT = ${base}`],
    ['examples/react-demo/src/config.ts', `http://localhost:${api}`],
    ['examples/react-demo/e2e/ports.ts', `BASE_DEFAULT = ${base}`],
    ['packages/kyc-server/src/registry.ts', `http://localhost:${api}`],
    ['examples/full-service-demo/.env.example', `PORT=${api}`],
    ['examples/full-service-demo/.env.test', `http://localhost:${api}`],
    [
      'examples/full-service-demo/.env.test',
      `http://localhost:${webHosted},http://localhost:${webProxy}`,
    ],
    ['examples/access-token-demo/.env.example', `PORT=${token}`],
    [
      'examples/full-service-demo/.env.test',
      `DATABASE_URL=${testDatabaseUrl(testDb)}`,
    ],
    ['docker-compose.test.yml', `"\${KYC_TEST_DB_PORT:-${testDb}}:5432"`],
    [
      'examples/full-service-demo/docker-compose.yml',
      `"\${KYC_DEV_DB_PORT:-${devDb}}:5432"`,
    ],
    ['examples/full-service-demo/.env.example', devDatabaseUrl(devDb)],
    ['scripts/ci/postgres-brew.sh', 'KYC_TEST_DB_PORT'],
    [
      'examples/react-demo/e2e/ports.ts',
      `TEST_DB_OFFSET = ${SERVICES.testDb.offset}`,
    ],
  ])('%s carries %s', (file, literal) => {
    expect(read(file)).toContain(literal);
  });

  it('the Playwright module maps the web modes onto the web offsets', () => {
    const source = read('examples/react-demo/e2e/ports.ts');
    expect(source).toContain(`hosted: ${SERVICES.webHosted.offset}`);
    expect(source).toContain(`proxy: ${SERVICES.webProxy.offset}`);
    expect(source).toContain(`API_OFFSET = ${SERVICES.api.offset}`);
  });
});

describe("a worktree's block", () => {
  it('reads the worktrees of the porcelain listing, the main clone first', () => {
    const porcelain = [
      'worktree /Users/x/Dev/kyc',
      'HEAD 0000000000000000000000000000000000000000',
      'branch refs/heads/main',
      '',
      'worktree /Users/x/Dev/kyc-topic',
      'HEAD 1111111111111111111111111111111111111111',
      'detached',
      '',
    ].join('\n');
    expect(parseWorktrees(porcelain)).toEqual([
      { path: '/Users/x/Dev/kyc', isMain: true },
      { path: '/Users/x/Dev/kyc-topic', isMain: false },
    ]);
    expect(parseWorktrees('')).toEqual([]);
  });

  it.each([
    ['KYC_PORT_BASE=5120\n', 5120],
    ['export KYC_PORT_BASE="5140" # mine\n', 5140],
    ["  KYC_PORT_BASE='5160'\n", 5160],
    ['# KYC_PORT_BASE=5120\nOTHER=1\n', undefined],
    ['KYC_PORT_BASE=5120\nKYC_PORT_BASE=5180\n', 5180],
    ['KYC_PORT_BASE=\n', undefined],
    ['', undefined],
  ])('reads the claim in %j as %s', (text, base) => {
    expect(claimedBase(text)).toBe(base);
  });

  it('refuses a claim that is not a port', () => {
    expect(() => claimedBase('KYC_PORT_BASE=99999\n')).toThrow(
      /KYC_PORT_BASE must be a port number/,
    );
  });

  it('hands out the lowest free block above the default', () => {
    expect(nextFreeBase([])).toBe(5120);
    expect(nextFreeBase([5120, 5160])).toBe(5140);
    expect(nextFreeBase([5100, 5120, 5140])).toBe(5160);
    expect(nextFreeBase([5120], { base: 4100, step: 20, slots: 2 })).toBe(4120);
  });

  it('fails loudly when every block is claimed', () => {
    const all = Array.from(
      { length: BLOCK_SLOTS },
      (_, i) => BASE_DEFAULT + (i + 1) * BLOCK_STEP,
    );
    expect(() => nextFreeBase(all)).toThrow(/no free port block/);
  });

  it('appends the claim to .env.local, once', () => {
    const claimed = withClaimedBase('', 5120);
    expect(claimed).toBe(
      "# This worktree's port block (scripts/lib/ports.mjs; make ports shows it)\nKYC_PORT_BASE=5120\n",
    );
    expect(withClaimedBase(claimed, 5120)).toBe(claimed);
    expect(withClaimedBase('OTHER=1', 5140)).toBe(
      "OTHER=1\n# This worktree's port block (scripts/lib/ports.mjs; make ports shows it)\nKYC_PORT_BASE=5140\n",
    );
    expect(claimedBase(withClaimedBase('KYC_PORT_BASE=5120\n', 5160))).toBe(
      5160,
    );
  });
});
