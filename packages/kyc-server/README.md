# @blinkbitcoin/kyc-server

The server half of identity verification, for any Node ≥ 18 backend, no
framework, no peers:

- the **Sumsub adapter**: access-token minting per user, webhook signature
  verification, applicant status lookup, and the hosted verification page
  (the Sumsub Web SDK wrapped in the `kyc-bridge` protocol the client
  packages speak);
- the **verification-session domain** behind the proxy mode -
  `createVerificationService` over two ports, a `VerificationProvider`
  (Sumsub or the mock) and a `SessionStore` you implement on your database
  (an in-memory one ships) - with authorization and ownership, input bounds,
  persist-first creation with an audit trail, token refresh, status
  reconciliation and the webhook state machine (terminal statuses never
  downgrade; the guard lives inside the write).

This repo's reference backend is this package plus Express, Apollo and a
Postgres store; a backend that already exists (Blink's GraphQL API) imports
the package instead of running that service.

## Mint a token for the native SDK (mode 2)

```ts
import { defaultRegistry, providerFromEnv } from '@blinkbitcoin/kyc-server';

// Once, at startup: KYC_PROVIDER selects sumsub or mock; SUMSUB_* is read
// only when sumsub is selected
const provider = providerFromEnv(process.env, defaultRegistry(process.env));

// Per request, for the authenticated user
const { accessToken } = await provider.createSession(session.userId, {
  platform: 'IOS',                 // WEB | IOS | ANDROID
  levelName: 'basic-kyc-level',    // optional; SUMSUB_LEVEL_NAME by default
});
// Hand `accessToken` to the app's createSumsubNativeSource({ getAccessToken })
```

Missing settings fail fast (`SumsubConfigError`), transient Sumsub failures
(5xx, 429, network) are retried with backoff, and a 4xx becomes
`SESSION_CREATION_FAILED` rather than an invitation to retry.

## The verification domain (proxy mode without hosting the service)

```ts
import {
  createVerificationService, createMemorySessionStore, type SessionStore,
  defaultRegistry, providerFromEnv, providerNameFromEnv,
} from '@blinkbitcoin/kyc-server';

const registry = defaultRegistry(process.env);
const providerName = providerNameFromEnv(process.env, registry);
const provider = providerFromEnv(process.env, registry);
const store: SessionStore = createMemorySessionStore(); // or your own, over your database
const sessions = createVerificationService({
  provider, providerName, store,
  publicBaseUrl: () => 'https://api.example.com', // the hosted page lives under it
});

// In your API, with the authenticated user:
const started = await sessions.start(userId, { platform: 'WEB' }); // { sessionId, accessToken, url, allowedOrigin, ... }
const { accessToken } = await sessions.refresh(userId, started.sessionId);
const view = await sessions.status(userId, started.sessionId);     // reconciled against the provider when not terminal

// In your webhook route, with the RAW body bytes:
if (!provider.verifyWebhook(req.headers, rawBody, req.ip)) return 401;
const event = provider.parseWebhookEvent(rawBody);
if (!event) return 400;
await sessions.handleWebhookEvent(event); // idempotent; terminal statuses never downgrade
```

`createKycGraphQL({ sessions })` gives your Apollo (or any GraphQL) server
the schema the client packages codegen against: `typeDefs` plus resolvers
that only map onto the service, with a context `{ userId }`.

Every failure is a `KycError` with a `code` (`UNAUTHORIZED`,
`VALIDATION_ERROR`, `SESSION_NOT_FOUND`, `SESSION_CREATION_FAILED`,
`PROVIDER_UNAVAILABLE`, `PERSISTENCE_FAILED`) and a matching
`extensions.code`, the wire contract the client packages map to messages.
`createMockProvider` gives the same port without Sumsub for local runs and
tests; `Tracing` and `Logger` are optional seams.

| Store method | Contract |
|---|---|
| `transaction(fn)` | every write through the store `fn` receives commits together or not at all |
| `createSession`, `getSessionById`, `getSessionByIdForUser`,<br>`getSessionByProviderApplicantId`, `getLatestUnboundSessionForUser` | session rows; the user-scoped read returns `null` for a wrong owner<br>(no info leak) |
| `updateSessionStatus` | the conditional write: refuses to move a terminal session<br>(`rejected_terminal`), reports `unchanged` and `updated`; throws for an<br>unknown id. Only the domain calls it (guard-tested) |
| `bindApplicantId` | binds an unbound session, idempotently; reports another applicant<br>rather than stealing a bound one |
| `appendAuditEntry`, `listAuditEntries` | audit rows, newest first |

## The Postgres store (`@blinkbitcoin/kyc-server/knex`)

For a host that keeps sessions in Postgres, the store port and its schema are
already written. The host passes its own Knex instance; `knex` is an optional
peer for the types only, nothing else is imported:

```ts
import { createKnexSessionStore, runKycMigrations } from '@blinkbitcoin/kyc-server/knex';

await runKycMigrations(db);                        // once per database (knex.migrate.latest)
const store = createKnexSessionStore(db);          // any Knex instance; { logger } optional
const sessions = createVerificationService({ provider, providerName, store, publicBaseUrl });
```

The migrations are a programmatic Knex migration source
(`createKycMigrationSource()`, `KYC_MIGRATIONS`), so no migration files,
knexfile or TypeScript loader are needed at runtime. Two tables,
`VerificationSession` and `AuditLog`
([data-models](../../docs/architecture/data-models.md)); the terminal guard
is part of the UPDATE, behind a `FOR UPDATE` read.

## As a serverless / route handler (no framework)

The endpoints exist as Fetch API `Request → Response` handlers, the shape
Vercel and Netlify functions, Next.js route handlers and Lambda adapters
mount directly:

```ts
import { createSessionStartHandler, createWebhookHandler, createHostedPageHandler } from '@blinkbitcoin/kyc-server';

export const POST = createSessionStartHandler({
  sessions,
  authenticate: async request => verifySession(request.headers.get('authorization')), // user id or null
});
// createSessionRefreshHandler({ sessions, authenticate }), createWebhookHandler({ provider, sessions, clientIp? }),
// createHostedPageHandler({ sessions, provider }) are the others
```

They answer the same status codes as the Express router (`401`, `400`,
`404`, `502` / `500`), because both call the same `startSessionHttp` /
`refreshSessionHttp` / `processWebhookHttp` / `hostedPageHttp` decision
functions. Runs on Node runtimes (needs `node:crypto`); not on edge runtimes.

## The HTTP surface (`@blinkbitcoin/kyc-server/express`)

For a host that already runs Express and wants the kyc endpoints without
writing them: a mountable router plus the GraphQL schema. `express` is an
optional peer - only this subpath imports it.

```ts
import { createKycRouter } from '@blinkbitcoin/kyc-server/express';
import { createKycGraphQL } from '@blinkbitcoin/kyc-server';

app.use(createKycRouter({
  sessions, provider, providerName,
  middleware: { hosted: [rateLimit], webhook: [rateLimit] }, // your policy
}));
const { typeDefs, resolvers } = createKycGraphQL({ sessions }); // → your Apollo/GraphQL server, context { userId }
```

| Route | What |
|---|---|
| `GET /health` | `{ status, timestamp }` |
| `GET /hosted/:sessionId` | the provider's hosted page for a live session, a token minted per<br>render, under a nonce CSP, `Permissions-Policy`, `no-store`; the<br>not-found page (404 / 502) tells the app to stop waiting |
| `POST /webhook/kyc/:provider` | only the configured provider (`404` otherwise); raw-body signature<br>check (`401`), parse (`400`), `handleWebhookEvent` (`500` = retry,<br>`200 { received, outcome }`) |

## The Sumsub adapter (`@blinkbitcoin/kyc-server/sumsub`)

Everything Sumsub-specific is also on its own entry, peer-free: the client
(`createSumsubClient`, `signPayload`), `sumsubConfigFromEnv` and the
`SUMSUB_*` mapping, `createSumsubProvider`, the hosted page
(`renderSumsubPage`, `sumsubHostedPage`, the status table generated from
kyc-core's `mapSumsubStatus`). The root entry keeps re-exporting all of it;
the subpath is the canonical import for Sumsub names.

| Entry | What | Peer |
|---|---|---|
| `@blinkbitcoin/kyc-server` | everything: domain, ports, registry, handlers, pages, Sumsub + mock<br>adapters | none |
| `@blinkbitcoin/kyc-server/sumsub` | the Sumsub adapter | none |
| `@blinkbitcoin/kyc-server/express` | `createKycRouter`, `sendHostedPage` | `express` |
| `@blinkbitcoin/kyc-server/knex` | the Postgres store + migrations | `knex` (types only) |

The package reaches `@blinkbitcoin/kyc-core` only through its Apollo-free
`/sumsub` and `/hosted` entries (guard-tested), so a backend never installs
`@apollo/client` or `graphql` for it.

## Configuration

| Variable | Setting | Notes |
|---|---|---|
| `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` | the REST credentials | required when `KYC_PROVIDER=sumsub` |
| `SUMSUB_WEBHOOK_SECRET` | webhook signing secret | required; `X-Payload-Digest` is verified over the raw body |
| `SUMSUB_LEVEL_NAME` | default level | `basic-kyc-level` unless the session input names one |
| `SUMSUB_BASE_URL`, `SUMSUB_TOKEN_TTL_SECS`, `SUMSUB_REQUEST_TIMEOUT_MS` | tuning | `https://api.sumsub.com`, 600 s, 10 000 ms |
| `KYC_PROVIDER` | `sumsub` or `mock` | `mock` by default; an unknown name warns once and falls back |
| `MOCK_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` | the mock's webhooks | the reference backend's `.env.example` lists them |

## Development (in this monorepo)

```sh
make test        # Jest, 100% coverage enforced
make build       # tsup (ESM + CJS + types)
```

The reference host is `examples/full-service-demo` (Knex store, Express + Apollo, the same
router mounted).
