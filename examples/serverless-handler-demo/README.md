# examples/serverless-handler-demo - the handler behind a route

`@blinkbitcoin/kyc-node` ships the access-token endpoint as a Fetch API
preset, `Request → Response`, so a serverless route exports it as-is. This
example mounts it: `POST /verification/token` mints a provider access token
for the authenticated caller (what `createSumsubNativeSource({ getAccessToken })`
in the client packages needs), plus `GET /health`. Tokens only - no session
store, no webhook, no hosted page.

```ts
// src/handlers.ts - the whole integration
const provider = accessTokenProviderFromEnv(env);      // Sumsub, or the mock; checked at startup
const app = createAccessTokenApp({ provider, authenticate });
export const { GET, POST, OPTIONS } = handlers(app);   // what a route file exports
```

| Platform | Mounting |
|---|---|
| Next.js route handler | `app/api/[...path]/route.ts`:<br>`export const { GET, POST, OPTIONS } = handlers(app);` |
| Vercel function | `export default (req: Request) => app.fetch(req);` |
| Cloudflare Worker | `fetch(request) { return app.fetch(request); }` (with `nodejs_compat`:<br>the Sumsub request signing needs `node:crypto`) |
| Plain Node (this example) | `src/node.ts` adapts `IncomingMessage` to a `Request` and back |

`authenticate` is the host's session check - the bearer token is taken as the
user id here; a real host verifies its own token in that spot. The Sumsub
credentials stay in the function's environment, and `KYC_ENV=production`
refuses the sandbox token and the mock at startup.

## Run

```sh
cp .env.example .env
make dev                     # http://localhost:5106 (PORT overrides; KYC_PORT_BASE + 6), mock provider
curl -s -X POST http://localhost:5106/verification/token \
  -H 'content-type: application/json' -H 'authorization: Bearer user-1' \
  -d '{"platform":"IOS"}'
```

With `KYC_PROVIDER=sumsub` and the app token and secret key in `.env`, the
endpoint mints a real Sumsub access token.

## Test

```sh
make test          # Vitest, 100% coverage enforced (make coverage)
```

CI boots this example with the mock provider and calls the route
(`scripts/e2e/server-demos-smoke.sh`, `make e2e-server-demos`).

## Two in-process examples and the service

[`access-token-demo`](../access-token-demo/README.md) adds one mutation to
an API you already have;
[`@blinkbitcoin/kyc-service`](../../packages/kyc-service/README.md) runs
the whole service.

This example is an illustration, not a deployment. The service package is
the same Fetch surface hardened for production - session verification, a
boot guard, rate limits - and ships route-handler and Worker entries
(`@blinkbitcoin/kyc-service/vercel`, `/cloudflare`) with templates, so the
serverless shape is two lines and environment variables.
