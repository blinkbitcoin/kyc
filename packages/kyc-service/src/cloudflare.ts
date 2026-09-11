// @blinkbitcoin/kyc-service/cloudflare - the service as a Worker.
//
// The whole deployment is this file plus environment variables:
//
//   // src/index.ts
//   export { default } from '@blinkbitcoin/kyc-service/cloudflare';
//
// `nodejs_compat` is required: the Sumsub request signing uses node:crypto.
// There is no Postgres driver on Workers, so this target serves access
// tokens only - the boot guard refuses DATABASE_URL here with a message
// that says so, rather than failing on the first webhook.
//
// The Worker's bindings ARE the environment: nothing here reads process.env,
// so secrets set with `wrangler secret put` reach the same variable names a
// container reads from its env file.

import { createKycApp, type KycApp } from './app';
import type { Env } from './env';

// One app per environment object. A Worker isolate serves many requests with
// the same bindings, so the boot guard, the JWKS cache and the provider are
// built once, not per request.
const apps = new WeakMap<object, KycApp>();

export const workerApp = (env: Env): KycApp => {
  const cached = apps.get(env as object);
  if (cached) {
    return cached;
  }
  const app = createKycApp(env, { runtime: 'edge' });
  apps.set(env as object, app);
  return app;
};

export interface Worker {
  fetch: (request: Request, env: Env) => Promise<Response>;
}

const worker: Worker = {
  fetch: (request, env) => workerApp(env).fetch(request),
};

export default worker;
