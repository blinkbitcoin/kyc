// What this deployment can do, decided by the environment alone.
//
// Access tokens (POST /verification/token, /health) are always on: minting
// needs no database and no state, so every target - a container, a Vercel
// route, a Cloudflare Worker - serves them. Sessions (the GraphQL API, the
// hosted page, the provider webhook, the Knex store and its migrations) need
// Postgres, so they follow DATABASE_URL: set it and the routes exist, leave
// it unset and they are absent, no pg connection is opened and no
// SUMSUB_WEBHOOK_SECRET is required.
//
// Pure: env in, capabilities out. Nothing here reads process.env, opens a
// connection or imports a runtime-specific module.

import type { Env } from './env';

export type { Env };

// The capability that is always on
export const TOKENS = 'tokens';

// The capability DATABASE_URL switches on
export const SESSIONS = 'sessions';

export type Capability = typeof TOKENS | typeof SESSIONS;

// The variable that decides session orchestration
export const DATABASE_URL = 'DATABASE_URL';

// Sessions are on exactly when DATABASE_URL holds a value; a blank or
// whitespace-only value is "unset" (an env file with `DATABASE_URL=` must
// not half-enable the capability and then fail to connect).
export const hasSessions = (env: Env): boolean => (env[DATABASE_URL] ?? '').trim().length > 0;

// The capabilities this environment turns on, in report order
export const capabilitiesFromEnv = (env: Env): Capability[] =>
  hasSessions(env) ? [TOKENS, SESSIONS] : [TOKENS];

// The capability list as one line, for /health and the boot guard's message
export const describeCapabilities = (capabilities: readonly Capability[]): string =>
  capabilities.join(', ');
