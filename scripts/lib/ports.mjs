// The ports of every service this repo runs, from one base port. Every
// service listens on KYC_PORT_BASE (default 5100; 5000 is everybody's port,
// and esign's block is 4100) plus a fixed offset, so one variable moves a
// whole worktree (`KYC_PORT_BASE=5300 make e2e-web`) and repos never clash.
// Each service also has its own override variable for the odd case, which
// wins over the base. Consumers: the Playwright ports module
// (examples/react-demo/e2e/ports.ts, guarded against this table by its
// test), the shell scripts (through scripts/e2e/ports-env.sh) and the
// services' own PORT defaults (each declares its offset; ports.test.mjs
// checks the literals in those files against this table).

export const BASE_VAR = 'KYC_PORT_BASE';
export const BASE_DEFAULT = 5100;

/** key → { offset from the base, the override variable, what listens there } */
export const SERVICES = {
  api: { offset: 0, env: 'KYC_API_PORT', what: 'kyc-service' },
  webHosted: {
    offset: 1,
    env: 'KYC_WEB_PORT',
    what: 'react-demo, hosted mode',
  },
  webProxy: {
    offset: 2,
    env: 'KYC_WEB_PROXY_PORT',
    what: 'react-demo, proxy mode',
  },
  token: {
    offset: 3,
    env: 'TOKEN_PORT',
    what: 'access-token-demo (make e2e-server-demos, make e2e-live)',
  },
  testDb: {
    offset: 4,
    env: 'KYC_TEST_DB_PORT',
    what: 'the E2E Postgres (docker-compose.test.yml; CI macOS: Homebrew)',
  },
};

/** The E2E database URL for that port (what .env.test carries for the default). */
export const testDatabaseUrl = port =>
  `postgresql://test:test@localhost:${port}/kyc_test`;

/**
 * A port from one variable: unset or empty means the fallback; anything
 * else must be a real port number, so a typo fails here and not as a
 * server that never comes up.
 */
export const portFrom = (name, value, fallback) => {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(
      `${name} must be a port number (1-65535), got ${JSON.stringify(value)}`,
    );
  }
  return Number(value);
};

/** The base port from the environment (validated), else the default. */
export const baseFrom = env => portFrom(BASE_VAR, env[BASE_VAR], BASE_DEFAULT);

/** Every service's port: its override variable if set, else base + offset. */
export const resolvePorts = env => {
  const base = baseFrom(env);
  const ports = { base };
  for (const [key, { offset, env: name }] of Object.entries(SERVICES)) {
    ports[key] = portFrom(name, env[name], base + offset);
  }
  return ports;
};

/**
 * Shell lines that export every service's override variable with its
 * resolved value (what scripts/e2e/ports-env.sh evals), so a script reads
 * `$KYC_API_PORT` and gets the base-derived default or the caller's own.
 */
export const envLines = env => {
  const ports = resolvePorts(env);
  return [
    `export ${BASE_VAR}=${ports.base}`,
    ...Object.entries(SERVICES).map(
      ([key, { env: name }]) => `export ${name}=${ports[key]}`,
    ),
    // The E2E suites and the backend read DATABASE_URL (.env.test holds the
    // default); a script that moved the base exports this one over it
    `export KYC_TEST_DATABASE_URL=${testDatabaseUrl(ports.testDb)}`,
  ];
};
