# Running identity verification in production

Who reads which section:

| You are | Read |
|---------|------|
| Deciding what to run | [1. What runs where](#1-what-runs-where) |
| The Sumsub account owner | [2. Sumsub go-live](#2-sumsub-go-live-account-owner) |
| The backend developer | [3. Backend developer](#3-backend-developer) |
| DevOps, deploying the reference service | [4. DevOps](#4-devops) |
| The mobile or web developer | [5. App developer](#5-app-developer) |
| Everyone, before the switch | [6. Verification checklist](#6-verification-checklist) |
| On call | [7. Failure modes](#7-failure-modes) |

Everything below is taken from the code: the boot guard in
`packages/kyc-service/src/config.ts`, the env in
`packages/kyc-service/.env.example`, the controls in
[../architecture/security.md](../architecture/security.md), and the
package's own [README](../../packages/kyc-node/README.md). When they
disagree with this page, the code wins - fix the page.

## 1. What runs where

Modes 2 and 3 need code on a backend you control; mode 1 needs a hosted
page somewhere. Two tiers cover all of it, and the app code is the same in
both - only the `VerificationSource` changes.

### Tier A: your API calls the package in-process

`@blinkbitcoin/kyc-node` inside your own Node backend (Node ≥ 18, no
framework requirement, no peers).

- **Mode 2, the native SDK:** one authenticated mutation or route that
  calls `provider.createSession` and returns `{ accessToken }`. Nothing to
  store, no webhook, no page: the SDK asks the app for a fresh token when
  the old one expires, so that one call is also the refresh.
  Runnable shape: [`examples/access-token-demo`](../../examples/access-token-demo/README.md).
- **Mode 3, the proxy session, over your own store:** `createVerificationService`
  over the provider and store ports, the Fetch handlers or the `/express`
  router, `/knex` if you want the package's store and migrations. You keep
  your auth, your CORS, your rate limits.

### Tier B: the reference service is deployed

[`packages/kyc-service`](../../packages/kyc-service/README.md):
Express 5 + Apollo Server 5 + Knex/PostgreSQL composed on the package, with
this service's auth, CORS allow-list, rate limits and fail-closed boot. It
serves all four routes and is the backend every E2E suite runs against.

There is **no container image yet**. Tier B is a Node process you build and
run (section 4); a Dockerfile and a published image are the stated
follow-up, not something to wait for.

### Pick a tier

| You have | Tier |
|----------|------|
| An API already, and only the native SDK (mode 2) | A |
| An API already, and you want sessions and webhook status in your own DB | A, `/knex` or your own store |
| No backend, or you want the whole thing as one service | B |
| Mode 1 only, with a page you serve yourself | neither - your page speaks the [bridge protocol](../integration/hosted.md) |

## 2. Sumsub go-live (account owner)

1. **Two Sumsub apps.** The sandbox app token is what
   [`make sumsub-env`](../integration/sumsub.md) writes for the live test
   tier; production gets its own app token and secret key, created in the
   production dashboard, never copied from the sandbox item.
2. **App token permissions.** The token must be allowed to create
   applicants and access tokens; a token without it answers `403` on
   `POST /resources/applicants`, which the service reports as
   `PROVIDER_UNAVAILABLE` (section 7).
3. **Levels.** `SUMSUB_LEVEL_NAME` is the default level a session uses
   when `verificationSessionStart` does not name one. Level names are
   whatever the dashboard calls them and differ per account; in tier A the
   host maps its own tiers to level names (`KYC_LEVEL_BASIC` /
   `KYC_LEVEL_ENHANCED` in the access-token example).
4. **Webhook.** Register `https://<PUBLIC_BASE_URL>/webhook/kyc/sumsub`
   with a secret key; that secret is `SUMSUB_WEBHOOK_SECRET`. The service
   verifies `X-Payload-Digest` over the raw body with the algorithm the
   request header names, so the digest algorithm you pick in the dashboard
   needs no configuration on the server. Without the webhook, statuses
   never advance past `pending`.
5. **Retention.** The service stores an applicant id and a status, never a
   document, an image or a name. Document retention is a dashboard
   setting on the Sumsub side.

## 3. Backend developer

### Tier A - mint for the native SDK

The whole surface is the access-token example's `src/session.ts`:
`providerFromEnv(...)` over the package registry, then
`provider.createSession(...)`. Your existing session check decides who the
caller is; the user's id becomes the applicant's external id. Read
[the package README](../../packages/kyc-node/README.md) for the call and
[native-sdk.md](../integration/native-sdk.md) for the app side.

### Tier A - the session domain over your store

`createVerificationService` needs a `VerificationProvider` (the package's
Sumsub adapter, or the mock) and a `SessionStore` (the package's Knex store
via `/knex`, or yours). The service is the single write path for a status
change: the terminal-state guard (`approved` and `finallyRejected` never
downgrade) is part of the store's conditional write, so implement it as
such if you bring your own store. Mount the `/express` router or the Fetch
handlers for the hosted page and the webhook.

### Tier B - the two things the host must supply

- **The bearer token.** With `JWT_SECRET` set, the service verifies the
  app's `Authorization: Bearer` token as HS256 and takes the `sub` claim as
  the user id. Every session read and refresh is owner-scoped against it.
  Your app's session token must therefore be an HS256 JWT signed with that
  secret, or you put the service behind your own auth that mints one.
- **The webhook route reachable from Sumsub**, at the public base URL,
  unauthenticated (it is signature-verified), rate-limited at 120/min.

## 4. DevOps

### Build and run

From a checkout with the packages built (`npm run build` at the root builds
the four libraries, and the service's `npm run build` needs their dist):

```sh
npm ci
npm run build                                   # the packages
npm run build -w packages/kyc-service     # tsc -> packages/kyc-service/dist
npm run migrate -w packages/kyc-service   # applies the package's migrations to DATABASE_URL, then exits
npm run start -w packages/kyc-service     # node dist/index.js
```

`npm run migrate` is idempotent and safe to run before every start; run it
once per database change, not on every replica. The schema is the
package's programmatic migration source (`runKycMigrations` from
`@blinkbitcoin/kyc-node/knex`), so there are no migration files to ship.

### The environment

The service **refuses to boot** when any required value is missing or
malformed (`validateSecurityConfig`); it does not consult `NODE_ENV` for
that decision. `NODE_ENV=production` separately turns on `trust proxy 1`
and turns off GraphQL introspection and stack traces.

| Variable | Required | What it does |
|----------|----------|--------------|
| `DATABASE_URL` | yes | PostgreSQL 15+, `postgresql://user:pass@host:5432/kyc` |
| `KYC_PROVIDER` | yes, `sumsub` | `mock` is for development only and itself requires `ALLOW_INSECURE_DEV=true` |
| `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` | with `sumsub` | The REST credentials (app-token auth) |
| `SUMSUB_WEBHOOK_SECRET` | with `sumsub` | Verifies `X-Payload-Digest` on every webhook |
| `JWT_SECRET` | yes | HS256 key the app's bearer tokens are verified with |
| `PUBLIC_BASE_URL` | yes | Absolute `http(s)` URL this service is reachable at. The hosted page URL is `<PUBLIC_BASE_URL>/hosted/<sessionId>` and its origin is the `allowedOrigin` the apps pin `postMessage` to - no localhost fallback outside insecure dev |
| `CORS_ALLOWED_ORIGINS` | for web apps | Comma-separated browser origins; empty means no cross-origin browser access at all |
| `PORT` | no | Default `5100` |
| `SUMSUB_LEVEL_NAME` | no | Default level when the session input names none (`basic-kyc-level`) |
| `SUMSUB_BASE_URL`, `SUMSUB_TOKEN_TTL_SECS`, `SUMSUB_REQUEST_TIMEOUT_MS` | no | `https://api.sumsub.com`, `600`, `10000` |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_EXPORTER` | no | OpenTelemetry; tracing is off unless set |
| `ALLOW_INSECURE_DEV` | **never** | Bypasses the JWT and webhook checks; the only place it belongs is a developer's `.env` |

A production `.env` is therefore at minimum:

```env
DATABASE_URL=postgresql://user:pass@host:5432/kyc
KYC_PROVIDER=sumsub
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET_KEY=...
SUMSUB_WEBHOOK_SECRET=...
JWT_SECRET=...
PUBLIC_BASE_URL=https://kyc.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
NODE_ENV=production
```

### In front of the service

- **TLS terminates at your proxy**; the service listens on plain HTTP on
  `PORT`. `trust proxy 1` (production only) makes rate limiting key on the
  first `X-Forwarded-For` hop, so run exactly one trusted proxy in front.
- **Do not add `X-Frame-Options` or a `frame-ancestors` restriction** on
  `/hosted/*`. The page is meant to be embedded by host apps whose origin
  the service cannot know; it ships `frame-ancestors *` on purpose, and the
  trust boundary is the client-side origin pin
  ([security.md](../architecture/security.md#the-hosted-page-and-the-embedding-boundary)).
- **Do not strip `Permissions-Policy`** on `/hosted/*`. The page delegates
  `camera` and `microphone` to the provider's frame and nothing else; a
  proxy that rewrites it breaks capture inside the iframe.
- **`Cache-Control: no-store`** is set by the page; keep it. The session id
  in the URL is a bearer capability handed to one client.
- **Rate limits are built in** (`/graphql` 100/min, `/hosted/:sessionId`
  60/min, the webhook 120/min, 64 kB bodies) and `helmet` is on every
  response. Add your own edge limits on top, not instead.

### Health and lifecycle

`GET /health` is the liveness probe; `make e2e-backend-up` polls it, so
your orchestrator can too. The process is a plain Node server: a supervisor
(systemd, a container runtime, a PaaS) restarts it, and the boot guard makes
a misconfigured restart fail loudly rather than serve. Migrations run as a
separate step before the new version starts.

### Observability

Set the three `OTEL_*` variables to export traces; every provider call and
webhook is a span. Applicant data never reaches spans or the audit log (the
allow-list is the package's `audit.ts`).

## 5. App developer

What the app needs from the people above, per mode:

| Mode | From the backend | In the app |
|------|------------------|------------|
| 1 hosted | A `{ url }` for the session (the service's `verificationSessionStart` returns it) and, optionally, a refresh endpoint | `createHostedSource({ getSession, refreshToken })`; the `allowedOrigin` is derived from the URL unless you pin it yourself |
| 2 native SDK | One authenticated call that returns `{ accessToken }` | `createSumsubNativeSource({ getAccessToken })` plus the Sumsub SDK peer and the iOS pod |
| 3 proxy | The GraphQL URL and an HS256 JWT signed with `JWT_SECRET` (tier B) | `createKycApolloClient({ uri, getAuthToken })` + `createProxySource({ client, platform })` |

Web hosts also need their own page to allow `camera` and `microphone` to be
delegated to the frame, and the service's `CORS_ALLOWED_ORIGINS` to include
their origin. The exact list is in
[../../packages/kyc-react/README.md](../../packages/kyc-react/README.md#what-the-host-page-must-allow).

## 6. Verification checklist

Before switching a real app to a real account, in this order:

1. `make sumsub-check` against the **sandbox** `.env`: app-token auth and
   the level resolve, a throwaway token mints.
2. `make e2e-live`: the full live tier (token, status, hosted page, a signed
   webhook, the access-token example) passes against the sandbox.
3. The service boots with the production `.env` and **only** that env:
   `npm run start -w packages/kyc-service` prints no
   `ALLOW_INSECURE_DEV` warning and does not throw
   `Refusing to start: missing required security configuration`.
4. `curl https://<PUBLIC_BASE_URL>/health` returns `200` through the proxy.
5. `curl -I https://<PUBLIC_BASE_URL>/hosted/nonexistent` returns the
   not-found page with `Permissions-Policy` and `Cache-Control: no-store`
   intact - proof the proxy is not rewriting the hosted route.
6. A webhook test delivery from the Sumsub dashboard reaches
   `/webhook/kyc/sumsub` and is answered `200`; a tampered body is answered
   `401`.
7. One real journey per platform you ship, on a device, with a test
   applicant: the app reaches `approved` or `declined`, and
   `verificationSession` reports the same status afterwards.
8. `CORS_ALLOWED_ORIGINS` lists exactly the web origins that embed the
   component, and nothing else.

## 7. Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Refusing to start: missing required security configuration: …` | A required variable is unset, or `PUBLIC_BASE_URL` is not an absolute http(s) URL | The message names the variable; never "fix" it with `ALLOW_INSECURE_DEV` |
| `PROVIDER_UNAVAILABLE` on every start, `403` in the provider span | The app token lacks the permission to create applicants or access tokens, or sandbox credentials are pointed at the production base URL | Reissue the token with the permission; check `SUMSUB_BASE_URL` |
| Sessions stay `pending` forever | The webhook is not registered, not reachable, or answered `401` (secret mismatch) | Section 2 step 4; compare `SUMSUB_WEBHOOK_SECRET` with the dashboard |
| Webhook answered `200` but the status did not change | The terminal-state guard: the session is already `approved` or `finallyRejected`, or the delivery is a replay | By design; the audit log shows `webhook_rejected` with `reason: 'terminal_status'` |
| `UNAUTHORIZED` from the app | The bearer token is not an HS256 JWT signed with `JWT_SECRET`, or has no `sub` | Mint the app's session token accordingly (section 3, tier B) |
| `SESSION_NOT_FOUND` for a session that exists | Owner-scoping: the token's `sub` is not the session's user | Intentional; the two cases are indistinguishable to the caller |
| Camera never opens inside the hosted page on web | The host page does not delegate `camera`/`microphone` to the frame, or a proxy rewrote `Permissions-Policy` | Host page requirements in the web package README; section 4 |
| `TOKEN_EXPIRED` mid-flow | The refresh path is missing: no `refreshToken` on the hosted source, or the proxy refresh mutation is blocked | Wire the refresh; the built-in error screen already offers "Try again" |
| `SDK_UNAVAILABLE` on mobile | The Sumsub native module is not installed or the iOS pod was not run | `npm i @sumsub/react-native-mobilesdk-module && cd ios && bundle exec pod install` |

The full code table with the layer each code comes from:
[../integration/error-codes.md](../integration/error-codes.md).
