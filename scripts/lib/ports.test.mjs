import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BASE_DEFAULT,
  BASE_VAR,
  SERVICES,
  baseFrom,
  envLines,
  portFrom,
  resolvePorts,
  testDatabaseUrl,
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

  it('resolves the documented defaults', () => {
    expect(resolvePorts({})).toEqual({
      base: 5100,
      api: 5100,
      webHosted: 5101,
      webProxy: 5102,
      token: 5103,
      testDb: 5104,
      smoke: 5105,
      handler: 5106,
    });
    expect(testDatabaseUrl(5104)).toBe(
      'postgresql://test:test@localhost:5104/kyc_test',
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
      'export SMOKE_PORT=5105',
      'export HANDLER_PORT=5106',
      'export KYC_TEST_DATABASE_URL=postgresql://test:test@localhost:5104/kyc_test',
    ]);
  });
});

// The services cannot import this module (a browser tsconfig, a React
// Native bundle, an ES-module example), so each declares the base and its
// own offset as literals and derives its port from KYC_PORT_BASE. These
// checks keep those literals on the table - and, below, keep the
// derivation: a file that freezes a whole origin instead of deriving it
// looks correct here while ignoring the base entirely, which is how the
// mock's callbacks and the web demo ended up nailed to :5100 in every
// worktree.
describe('the consumers', () => {
  const { base, api, webHosted, webProxy, token, testDb, handler } =
    resolvePorts({});

  it.each([
    ['packages/kyc-service/src/port.ts', `PORT_BASE_DEFAULT = ${base}`],
    [
      'packages/kyc-service/src/port.ts',
      `PORT_OFFSET = ${SERVICES.api.offset}`,
    ],
    ['examples/access-token-demo/src/index.ts', `PORT_BASE_DEFAULT = ${base}`],
    [
      'examples/access-token-demo/src/index.ts',
      `PORT_OFFSET = ${SERVICES.token.offset}`,
    ],
    [
      'examples/serverless-handler-demo/src/index.ts',
      `PORT_BASE_DEFAULT = ${base}`,
    ],
    [
      'examples/serverless-handler-demo/src/index.ts',
      `PORT_OFFSET = ${SERVICES.handler.offset}`,
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
    [
      'examples/react-demo/vite.config.ts',
      `API_OFFSET = ${SERVICES.api.offset}`,
    ],
    ['examples/react-demo/e2e/ports.ts', `BASE_DEFAULT = ${base}`],
    ['packages/kyc-node/src/port.ts', `PORT_BASE_DEFAULT = ${base}`],
    ['packages/kyc-node/src/port.ts', `API_OFFSET = ${SERVICES.api.offset}`],
    ['packages/kyc-service/.env.example', `PORT=${api}`],
    ['packages/kyc-service/.env.test', `http://localhost:${api}`],
    [
      'packages/kyc-service/.env.test',
      `http://localhost:${webHosted},http://localhost:${webProxy}`,
    ],
    ['examples/access-token-demo/.env.example', `PORT=${token}`],
    ['examples/serverless-handler-demo/.env.example', `PORT=${handler}`],
    [
      'packages/kyc-service/.env.test',
      `DATABASE_URL=${testDatabaseUrl(testDb)}`,
    ],
    ['docker-compose.test.yml', `"\${KYC_TEST_DB_PORT:-${testDb}}:5432"`],
    ['scripts/ci/postgres-brew.sh', 'KYC_TEST_DB_PORT'],
    ['scripts/ci/docker-smoke.sh', `CONTAINER_PORT="${'${2:-'}${api}}"`],
    ['packages/kyc-service/Dockerfile', `EXPOSE ${api}`],
    ['packages/kyc-service/deploy/docker-compose.yml', `"${api}:${api}"`],
    [
      'packages/kyc-service/deploy/k8s/deployment.yaml',
      `containerPort: ${api}`,
    ],
  ])('%s carries %s', (file, literal) => {
    expect(read(file)).toContain(literal);
  });

  // The check the pins above cannot make: a file may carry the right port
  // literal and still ignore KYC_PORT_BASE, which is a frozen origin and so
  // wrong in every worktree but the default one. Every file that resolves a
  // port at runtime has to name the base variable.
  // examples/react-demo/src/config.ts is the one exception and stays out of
  // this list: it is browser code and can only see import.meta.env.VITE_*,
  // so vite.config.ts derives VITE_API_ORIGIN from the base on its behalf.
  it.each([
    'packages/kyc-service/src/port.ts',
    'packages/kyc-node/src/port.ts',
    'examples/access-token-demo/src/index.ts',
    'examples/serverless-handler-demo/src/index.ts',
    'examples/react-native-demo/src/config.ts',
    'examples/react-demo/vite.config.ts',
    'examples/react-demo/e2e/ports.ts',
  ])('%s derives its port from the base, not a frozen literal', file => {
    // Comment lines only: a file that merely EXPLAINS the base while
    // freezing its origin would otherwise pass on its own prose. Trailing
    // comments are left alone on purpose - stripping from the first `//`
    // would also eat `http://localhost:${...}`, the very line being checked.
    const code = read(file)
      .split('\n')
      .filter(line => !/^\s*(\/\/|\/?\*)/.test(line))
      .join('\n');
    expect(code).toContain(BASE_VAR);
  });

  it('the Playwright module maps the web modes onto the web offsets', () => {
    const source = read('examples/react-demo/e2e/ports.ts');
    expect(source).toContain(`hosted: ${SERVICES.webHosted.offset}`);
    expect(source).toContain(`proxy: ${SERVICES.webProxy.offset}`);
    expect(source).toContain(`API_OFFSET = ${SERVICES.api.offset}`);
  });
});
