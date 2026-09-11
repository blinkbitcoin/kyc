// The boot guard: everything that must be true before this deployment
// answers a single request, checked once, in one place, from the environment
// alone.
//
// The posture is enforced at STARTUP, not inferred per request from NODE_ENV.
// A deployment that lacks what it needs must refuse to start (fail-closed)
// rather than silently trusting clients. Local development that intentionally
// runs without secrets opts in explicitly with ALLOW_INSECURE_DEV=true.
//
// `configErrors` is pure - env in, a list of problems out - so the container
// checks the same rules at boot that a Vercel or Worker function checks at
// first import, and `validateConfig` throws one message listing all of them
// plus the capabilities that are on.

import { SUMSUB_ENV } from '@blinkbitcoin/kyc-node';

import {
  type Capability,
  capabilitiesFromEnv,
  describeCapabilities,
  hasSessions,
} from './capabilities';
import { type Env, isInsecureDevAllowed } from './env';
import { selectProvider } from './providers';
import { SESSION_HS256_SECRET, SESSION_JWKS_URL, sessionSourceFromEnv } from './session';

export {
  ALLOW_INSECURE_DEV,
  type Env,
  isInsecureDevAllowed,
  isJwtRequired,
  isWebhookSignatureRequired,
} from './env';

// The variable that declares a deployment production (the package's guard
// reads the same one; NODE_ENV never decides anything here)
export const KYC_ENV = 'KYC_ENV';

// Where the app runs. `node` has a filesystem, a Postgres driver and the
// GraphQL executor; `edge` (a Cloudflare Worker) has none of them and serves
// access tokens only.
export type Runtime = 'node' | 'edge';

export interface ValidateConfigOptions {
  // The target this configuration is being checked for (default 'node')
  runtime?: Runtime;
}

// The session source must exist: without one, nothing can turn a bearer
// token into a user id, and every request would be anonymous.
const sessionErrors = (env: Env): string[] =>
  sessionSourceFromEnv(env) === null
    ? [
        `no session verification is configured: set ${SESSION_JWKS_URL} or ${SESSION_HS256_SECRET} (JWT_SECRET is an accepted alias), or ALLOW_INSECURE_DEV=true for local dev`,
      ]
    : [];

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

// The hosted-page URL handed to clients and the `allowedOrigin` they pin
// postMessage to are both derived from PUBLIC_BASE_URL, so once sessions
// are on an unset value must not silently fall back to localhost outside
// insecure dev. Tokens alone hand out no URL and need none.
const publicBaseUrlErrors = (env: Env): string[] => {
  if (!hasSessions(env)) {
    return [];
  }
  const value = env.PUBLIC_BASE_URL;
  if (!value) {
    return isInsecureDevAllowed(env)
      ? []
      : [
          'PUBLIC_BASE_URL is required once sessions are on (or set ALLOW_INSECURE_DEV=true for local dev)',
        ];
  }
  return isHttpUrl(value)
    ? []
    : [`PUBLIC_BASE_URL must be an absolute http(s) URL (got "${value}")`];
};

// The provider must be able to mint: the settings an access token needs
// have to be present, the mock must be allowed in this environment, and a
// production deployment must not be on demo settings. The service's own
// selection does all of it - running it here is how the checks happen at
// boot instead of on the first mint.
const providerErrors = (env: Env): string[] => {
  try {
    selectProvider(env, {
      // A typo'd KYC_PROVIDER must be a boot error here, not a silent
      // fallback with a warning
      onUnknown: (name) => {
        throw new Error(`unknown KYC_PROVIDER: ${name}`);
      },
    });
    return [];
  } catch (error) {
    // Everything selection throws is an Error (SumsubConfigError,
    // ProductionConfigError, the mock refusal, the unknown-name error)
    return [(error as Error).message];
  }
};

// The webhook secret verifies inbound deliveries, so it is required exactly
// when the webhook route exists - that is, when sessions are on and the
// provider actually signs.
const webhookErrors = (env: Env): string[] =>
  hasSessions(env) &&
  env.KYC_PROVIDER === 'sumsub' &&
  !env[SUMSUB_ENV.webhookSecret] &&
  !isInsecureDevAllowed(env)
    ? [
        `${SUMSUB_ENV.webhookSecret} is required to verify the Sumsub webhook (or ALLOW_INSECURE_DEV=true)`,
      ]
    : [];

// What this environment asks for that this runtime cannot do
const runtimeErrors = (env: Env, runtime: Runtime): string[] =>
  runtime === 'edge' && hasSessions(env)
    ? [
        'DATABASE_URL is set, but this runtime cannot open a Postgres connection: the Cloudflare target serves access tokens only. Deploy the container or the Node target for sessions',
      ]
    : [];

// Everything wrong with running `env` on `runtime`, one message per problem.
// Pure: no process.env, no connections, no side effects a caller can see.
export const configErrors = (env: Env, options: ValidateConfigOptions = {}): string[] => {
  const runtime = options.runtime ?? 'node';
  return [
    ...sessionErrors(env),
    ...publicBaseUrlErrors(env),
    ...providerErrors(env),
    ...webhookErrors(env),
    ...runtimeErrors(env, runtime),
  ];
};

// Validate at boot and report the capabilities that are on. Throws one
// message listing every problem - a misconfigured container fails to start,
// and a misconfigured function fails at first import.
export const validateConfig = (
  env: Env = process.env,
  options: ValidateConfigOptions = {}
): Capability[] => {
  const capabilities = capabilitiesFromEnv(env);
  const errors = configErrors(env, options);
  if (errors.length > 0) {
    throw new Error(
      `Refusing to start (capabilities: ${describeCapabilities(capabilities)}): ${errors.join('; ')}`
    );
  }
  if (isInsecureDevAllowed(env)) {
    console.warn(
      '⚠️  ALLOW_INSECURE_DEV=true - session and webhook signature verification may be bypassed. NEVER set this in production.'
    );
  }
  return capabilities;
};

// Allowed CORS origins from CORS_ALLOWED_ORIGINS (comma-separated).
// Empty => same-origin only (no cross-origin browser access).
export const getAllowedOrigins = (env: Env = process.env): string[] =>
  (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

export { getPublicBaseUrl, getPublicOrigin } from './publicUrl';
