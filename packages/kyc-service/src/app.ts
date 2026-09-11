// The service as one Fetch handler: `createKycApp(env) → { fetch }`.
//
// Everything a deployment does is decided here, from the environment alone:
// the boot guard runs once at construction (so a misconfigured function fails
// at first import, exactly as a container fails at boot), the capabilities
// decide which routes exist, and the routes themselves are the package's
// presets - createAccessTokenApp for the token half, and, only when
// DATABASE_URL turned sessions on, this service's Fetch webhook, hosted-page
// and GraphQL handlers, reached through the loader its entry supplied.
//
// Node-only pieces (Apollo, Knex, `pg`) are reachable only through the
// `loadSessions` loader an entry hands in - this module never names
// ./sessions, so a bundler following the Cloudflare entry cannot reach them
// either.
//
// The host's one obligation is session verification (JWKS or a shared
// secret): it turns the caller's bearer token into the user id the token is
// minted for and the session is owned by.

import { bearerToken, createAccessTokenApp } from '@blinkbitcoin/kyc-node';

import { type Capability, SESSIONS } from './capabilities';
import { getAllowedOrigins, KYC_ENV, type Runtime, validateConfig } from './config';
import type { Env } from './env';
import { selectProvider } from './providers';
import type { VerificationProvider } from './providers/port';
import { trustsProxy } from './proxy';
import { getPublicBaseUrl } from './publicUrl';
import { sessionVerifierFromEnv } from './session';
import type { LoadSessions } from './sessions';

const HEALTH_PATH = '/health';
const WEBHOOK_PREFIX = '/webhook/kyc/';
const GRAPHQL_PATH = '/graphql';
const HOSTED_PREFIX = '/hosted/';

// The baseline security headers. Helmet is Express-only, so the equivalents
// are set here - on every response that does not carry its own policy. The
// hosted page brings a nonce-based CSP from the package and keeps it.
export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'none';frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'strict-transport-security': 'max-age=15552000; includeSubDomains',
};

// What the hosted page may carry: it exists to be embedded in a host
// WebView or iframe, so X-Frame-Options and the cross-origin isolation
// headers would stop it from loading, and its CSP is the page's own.
export const PAGE_HEADERS: Record<string, string> = {
  'x-content-type-options': SECURITY_HEADERS['x-content-type-options'],
  'strict-transport-security': SECURITY_HEADERS['strict-transport-security'],
};

export interface KycAppDeps {
  // The provider to mint with (default: KYC_PROVIDER over this service's
  // registry) and the name it is registered under (default: KYC_PROVIDER)
  provider?: VerificationProvider;
  providerName?: string;
  // How the Node-only sessions module is reached. An entry that can serve
  // sessions passes `() => import('./sessions.js')`; the Cloudflare entry
  // passes nothing, and a DATABASE_URL it cannot honour is a boot error.
  loadSessions?: LoadSessions;
  // The target this app runs on (default 'node'); the boot guard refuses a
  // configuration the runtime cannot serve
  runtime?: Runtime;
}

export interface KycApp {
  fetch: (request: Request) => Promise<Response>;
  // What this deployment serves, as /health reports it
  capabilities: Capability[];
  // Drain: stops the GraphQL server when sessions are on
  stop: () => Promise<void>;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

// The allowed origin echoed back, and the Vary that keeps a shared cache
// from serving one origin's answer to another
export const corsHeaders = (origins: string[], request: Request): Record<string, string> => {
  if (origins.length === 0) {
    return {};
  }
  const vary = { vary: 'origin' };
  const origin = request.headers.get('origin');
  if (!origin) {
    return vary;
  }
  if (origins.includes('*')) {
    return { ...vary, 'access-control-allow-origin': '*' };
  }
  return origins.includes(origin) ? { ...vary, 'access-control-allow-origin': origin } : vary;
};

// Set what the response does not already say for itself
export const withDefaults = (response: Response, headers: Record<string, string>): Response => {
  for (const [key, value] of Object.entries(headers)) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  return response;
};

export const createKycApp = (env: Env = process.env, deps: KycAppDeps = {}): KycApp => {
  // Fail closed before anything is constructed: one message, every problem,
  // and the capabilities that were on.
  const capabilities = validateConfig(env, { runtime: deps.runtime });

  const selected = deps.provider
    ? { provider: deps.provider, providerName: deps.providerName ?? env.KYC_PROVIDER ?? 'mock' }
    : selectProvider(env);
  const { provider, providerName } = selected;
  const verify = sessionVerifierFromEnv(env);
  const origins = getAllowedOrigins(env);

  const authenticate = (request: Request): Promise<string | null> =>
    verify(bearerToken(request.headers.get('authorization') ?? undefined) ?? '');

  // The token half: POST /verification/token and its CORS preflight.
  // /health is this app's own (it reports the capabilities).
  const tokens = createAccessTokenApp({
    provider,
    authenticate,
    health: false,
    ...(origins.length > 0 ? { cors: { origins } } : {}),
  });

  // Sessions, built once and only when they are on, through the loader the
  // entry supplied. A target without one cannot serve the capability at
  // all, and saying so at construction beats 404ing the routes the
  // environment asked for.
  const load = capabilities.includes(SESSIONS) ? deps.loadSessions : undefined;
  if (capabilities.includes(SESSIONS) && !load) {
    throw new Error(
      'Refusing to start: DATABASE_URL asks for sessions, but this target was built without the sessions module. Deploy the container, or @blinkbitcoin/kyc-service/node'
    );
  }
  const sessions = load?.().then((module) =>
    module.createSessionCapability({
      env,
      provider,
      providerName,
      authenticate,
      publicBaseUrl: () => getPublicBaseUrl(env),
      introspection: env[KYC_ENV] !== 'production',
      trustProxy: trustsProxy(env),
    })
  );
  // A failure surfaces on the first request that needs the capability; this
  // only marks the promise handled so it is not an unhandled rejection
  sessions?.catch(() => undefined);

  const route = async (request: Request, url: URL): Promise<Response> => {
    if (request.method === 'GET' && url.pathname === HEALTH_PATH) {
      return withDefaults(
        json({ status: 'ok', capabilities, timestamp: new Date().toISOString() }),
        SECURITY_HEADERS
      );
    }

    if (sessions && request.method === 'POST' && url.pathname.startsWith(WEBHOOK_PREFIX)) {
      return withDefaults(await (await sessions).webhook(request), SECURITY_HEADERS);
    }

    if (sessions && url.pathname === GRAPHQL_PATH) {
      return withDefaults(await (await sessions).graphql(request), SECURITY_HEADERS);
    }

    if (sessions && request.method === 'GET' && url.pathname.startsWith(HOSTED_PREFIX)) {
      return withDefaults(await (await sessions).hosted(request), PAGE_HEADERS);
    }

    return withDefaults(await tokens.fetch(request), SECURITY_HEADERS);
  };

  return {
    capabilities,
    stop: async () => {
      await (await sessions)?.stop();
    },
    fetch: async (request) => {
      const url = new URL(request.url);
      const cors = corsHeaders(origins, request);

      // The token mint's preflight is the access-token app's; this one is
      // for the GraphQL endpoint the browser demos call cross-origin.
      if (request.method === 'OPTIONS' && url.pathname === GRAPHQL_PATH) {
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-max-age': '86400',
          },
        });
      }

      return withDefaults(await route(request, url), cors);
    },
  };
};
