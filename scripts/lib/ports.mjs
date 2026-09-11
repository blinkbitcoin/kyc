// The ports of every service this repo runs, from one base port. Every
// service listens on KYC_PORT_BASE (default 5100; 5000 is everybody's port,
// and esign's block is 4100) plus a fixed offset, so one variable moves a
// whole worktree (`KYC_PORT_BASE=5300 make e2e-web`) and repos never clash.
// Each service also has its own override variable for the odd case, which
// wins over the base. Consumers: the Playwright ports module
// (examples/react-demo/e2e/ports.ts, guarded against this table by its
// test), the shell scripts (through scripts/e2e/ports-env.sh) and the
// services' own PORT defaults (each declares its offset; ports.test.mjs
// checks the literals in those files against this table). Both Postgres
// containers are on the table too (docker-compose.test.yml and the dev
// compose read their host port from the variable), so a second worktree's
// databases never fight over 5432 either.

export const BASE_VAR = 'KYC_PORT_BASE';
export const BASE_DEFAULT = 5100;
// A worktree's block: BLOCK_STEP ports wide (the table uses the first
// Object.keys(SERVICES).length), BLOCK_SLOTS blocks above the default one
// (5120 .. 5980; 5000 is everybody's and 4100 is esign's).
export const BLOCK_STEP = 20;
export const BLOCK_SLOTS = 44;

/** key → { offset from the base, the override variable, what listens there } */
export const SERVICES = {
  api: { offset: 0, env: 'KYC_API_PORT', what: 'full-service-demo' },
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
  devDb: {
    offset: 5,
    env: 'KYC_DEV_DB_PORT',
    what: 'the dev Postgres (examples/full-service-demo/docker-compose.yml)',
  },
};

/** The E2E database URL for that port (what .env.test carries for the default). */
export const testDatabaseUrl = port =>
  `postgresql://test:test@localhost:${port}/kyc_test`;
/** The dev database URL for its port (dev/dev, kyc; what .env.example documents) */
export const devDatabaseUrl = port =>
  `postgresql://dev:dev@localhost:${port}/kyc`;

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
    `export KYC_DEV_DATABASE_URL=${devDatabaseUrl(ports.devDb)}`,
  ];
};

// ---------- A worktree's own block ----------
// A linked worktree claims a block once: the lowest free slot above the
// default one, written as KYC_PORT_BASE=<base> into its .env.local (direnv
// loads it on every later cd; the Makefile asks `ports.mjs claim` when the
// variable is unset). The main clone and CI keep the default. The registry
// of claims is the worktrees themselves: every sibling's .env.local.

/** The worktrees of `git worktree list --porcelain`; the first one is the main clone */
export const parseWorktrees = porcelain =>
  porcelain
    .split('\n')
    .filter(line => line.startsWith('worktree '))
    .map((line, index) => ({
      path: line.slice('worktree '.length),
      isMain: index === 0,
    }));

/**
 * The base a .env.local claims (`KYC_PORT_BASE=4120`, `export` and quotes
 * tolerated, comments ignored, the last assignment wins), undefined without one.
 */
export const claimedBase = (text, name = BASE_VAR) => {
  let value;
  for (const line of text.split('\n')) {
    const match = line.match(
      new RegExp(
        `^\\s*(?:export\\s+)?${name}=\\s*["']?(\\d*)["']?\\s*(?:#.*)?$`,
      ),
    );
    if (match) {
      value = match[1];
    }
  }
  return value ? portFrom(name, value, undefined) : undefined;
};

/** The lowest block above the default that no sibling has claimed */
export const nextFreeBase = (
  claimed,
  { base = BASE_DEFAULT, step = BLOCK_STEP, slots = BLOCK_SLOTS } = {},
) => {
  const taken = new Set(claimed);
  for (let slot = 1; slot <= slots; slot += 1) {
    const candidate = base + slot * step;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `no free port block: all ${slots} blocks above ${base} are claimed (free one by removing a worktree, or set ${BASE_VAR} yourself)`,
  );
};

/** The .env.local text with the claim appended (unchanged when it already claims that base) */
export const withClaimedBase = (text, base, name = BASE_VAR) => {
  if (claimedBase(text, name) === base) {
    return text;
  }
  const body = text.length > 0 && !text.endsWith('\n') ? `${text}\n` : text;
  return `${body}# This worktree's port block (scripts/lib/ports.mjs; make ports shows it)\n${name}=${base}\n`;
};
