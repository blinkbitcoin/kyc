// @blinkbitcoin/kyc-service/vercel - the service as a Vercel route handler.
//
// The whole deployment is this file plus environment variables:
//
//   // app/api/[...path]/route.ts
//   export { GET, POST, OPTIONS } from '@blinkbitcoin/kyc-service/vercel';
//
// Node runtime (the Sumsub request signing and, with a pooled DATABASE_URL,
// the Postgres store need it). The app is built at module load, so a
// misconfigured deployment fails at first import rather than on the first
// request - the same boot guard a container gets.

import { createKycApp, type KycApp } from './app';
import { loadSessions } from './loadSessions';

export interface RouteHandlers {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
  OPTIONS: (request: Request) => Promise<Response>;
}

// The three methods this service answers, all the same handler: the app
// routes on method and path itself.
export const handlers = (app: KycApp): RouteHandlers => {
  const handle = (request: Request): Promise<Response> => app.fetch(request);
  return { GET: handle, POST: handle, OPTIONS: handle };
};

export const { GET, POST, OPTIONS } = handlers(createKycApp(process.env, { loadSessions }));
