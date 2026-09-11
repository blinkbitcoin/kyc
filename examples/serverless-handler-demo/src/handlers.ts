// The access-token endpoint as a Fetch API handler (Request → Response), the
// shape a serverless route exports directly:
//
//   app/api/[...path]/route.ts  (Next.js)    export const { GET, POST, OPTIONS } = handlers(app);
//   api/[...path].ts            (Vercel)     export default (req: Request) => app.fetch(req);
//   worker.ts                   (Cloudflare) fetch(request) { return app.fetch(request); }
//
// Tokens only: no session store, no webhook, no hosted page - the shape of
// a host that hands its app a provider access token and nothing else
// (mode 2). The service package is the same surface with the sessions half
// behind DATABASE_URL.

import {
  type AccessTokenApp,
  accessTokenProviderFromEnv,
  bearerToken,
  createAccessTokenApp,
  type Logger,
  type VerificationProvider,
} from '@blinkbitcoin/kyc-node';

export type Handler = (request: Request) => Promise<Response>;

// The three methods a route handler exports, all the same handler: the app
// routes on method and path itself (the preflight, the mint, the health check)
export interface RouteHandlers {
  GET: Handler;
  POST: Handler;
  OPTIONS: Handler;
}

// What a host injects: where the package reports (default: the console)
export interface HandlerOptions {
  logger?: Logger;
}

// This example accepts `Authorization: Bearer <userId>` as-is; a real host
// verifies its own session token here. The package never sees the token.
export const authenticate = (request: Request): string | null =>
  bearerToken(request.headers.get('authorization'));

// The provider KYC_PROVIDER selects out of the package's registry: Sumsub
// unless `mock` is set, with everything a mint needs checked at startup (the
// app token and secret; KYC_ENV=production refuses the sandbox token and the
// mock). No webhook secret: this host receives none.
export const providerFromEnv = (
  env: NodeJS.ProcessEnv,
  { logger }: HandlerOptions = {},
): VerificationProvider => accessTokenProviderFromEnv(env, { logger });

// The whole integration: the preset over the selected provider and the
// host's session check. CORS_ALLOWED_ORIGINS (comma-separated) turns the
// preflight on for a browser caller; a native app needs none.
export const createApp = (
  env: NodeJS.ProcessEnv = process.env,
  options: HandlerOptions = {},
): AccessTokenApp => {
  const { logger } = options;
  const origins = (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
  return createAccessTokenApp({
    provider: providerFromEnv(env, options),
    authenticate,
    cors: origins.length > 0 ? { origins } : undefined,
    logger,
  });
};

export const handlers = (app: AccessTokenApp): RouteHandlers => {
  const handle: Handler = request => app.fetch(request);
  return { GET: handle, POST: handle, OPTIONS: handle };
};
