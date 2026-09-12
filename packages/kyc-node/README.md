# @blinkbitcoin/kyc-node

**For the backend developer who owns a Node API.** If you would rather deploy
a ready service than import a package, that is the other tier,
[`@blinkbitcoin/kyc-service`](../kyc-service/README.md).

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

The kyc service (`packages/kyc-service`) is this package plus a Fetch
runtime, Apollo and a Postgres store; a backend that already exists (Blink's
GraphQL API) imports the package instead of running that service.

Three worked hosts live in this repo, one per shape:
[`examples/access-token-demo`](../../examples/access-token-demo/README.md)
(one mutation on an existing API),
[`examples/serverless-handler-demo`](../../examples/serverless-handler-demo/README.md)
(the access-token preset behind a route handler) and
[`packages/kyc-service`](../kyc-service/README.md) (the whole service, also
shipped as the `kyc-service` image; its
[Deploy table](../kyc-service/README.md#deploy) has one row per target).
Taking either live is the runbook,
[docs/operations/production.md](../../docs/operations/production.md).

## Mint a token for the native SDK (mode 2)

```ts
import { accessTokenProviderFromEnv } from '@blinkbitcoin/kyc-node';

// Once, at startup: KYC_PROVIDER selects sumsub (the default here) or mock.
// Everything a mint needs is checked now, not on the first request: the
// app token and secret must be set, and KYC_ENV=production refuses the
// sandbox token and the mock (KYC_ALLOW_DEMO=true overrides).
const provider = accessTokenProviderFromEnv(process.env);

// Per request, for the authenticated user
const { accessToken } = await provider.createSession(session.userId, {
  platform: 'IOS',                 // WEB | IOS | ANDROID
  levelName: 'basic-kyc-level',    // optional; SUMSUB_LEVEL_NAME by default
});
// Hand `accessToken` to the app's createSumsubNativeSource({ getAccessToken })
```

Missing settings fail fast (`SumsubConfigError`), demo settings in
production too (`ProductionConfigError`), transient Sumsub failures (5xx,
429, network) are retried with backoff, and a 4xx becomes
`SESSION_CREATION_FAILED` rather than an invitation to retry.

The whole endpoint is a preset when the host would rather mount than write
it: `POST /verification/token` for the authenticated caller, a health check,
and nothing else - no session domain, no store, no webhook route.

```ts
import { createAccessTokenApp } from '@blinkbitcoin/kyc-node';
// or, on Express: import { createAccessTokenRouter } from '@blinkbitcoin/kyc-node/express';

export const { fetch } = createAccessTokenApp({
  provider,
  authenticate: request => userIdFromSession(request),   // null → 401
  // The level from the host's own data; the client's levelName is input,
  // never trusted on its own (undefined = the provider's default)
  levelFor: (input, { userId }) => levelForUser(userId),
  cors: { origins: ['https://app.example.com'] },       // optional
});
```

The SDK asks the app for a token again when it expires, so this one call is
also the refresh: nothing to store, nothing to look up. Both presets share
`mintAccessTokenHttp`, so a route handler of your own gets the same
decisions (401, 400 - also for a `levelFor` that throws
`Errors.validationError` - 502 when the provider cannot mint).

## The verification domain (proxy mode without hosting the service)

```ts
import {
  createVerificationService, createMemorySessionStore, type SessionStore,
  defaultRegistry, providerFromEnv, providerNameFromEnv,
} from '@blinkbitcoin/kyc-node';

const registry = defaultRegistry(process.env);
const providerName = providerNameFromEnv(process.env, registry);
const provider = providerFromEnv(process.env, registry);
const store: SessionStore = createMemorySessionStore(); // or your own, over your database
const sessions = createVerificationService({
  provider, providerName, store,
  publicBaseUrl: () => 'https://api.example.com', // the hosted page lives under it
  effects: {
    // Your policy, on the package's write path: runs after the commit, once
    // per real change, for webhooks and reconciled reads alike.
    onStatusTransition: async ({ session, previousStatus, source }) => {
      if (session.status === 'approved') await grantEntitlement(session.userId);
    },
  },
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

`effects.onStatusTransition` is where an approval becomes something in
your system. It is awaited and at-least-once: keep it idempotent, keep slow
work behind a queue, and expect an `effect_failed` audit row (never a
rolled-back status) when it throws.

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

## The Postgres store (`@blinkbitcoin/kyc-node/knex`)

For a host that keeps sessions in Postgres, the store port and its schema are
already written. The host passes its own Knex instance; `knex` is an optional
peer for the types only, nothing else is imported:

```ts
import { createKnexSessionStore, runKycMigrations } from '@blinkbitcoin/kyc-node/knex';

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
import { createSessionStartHandler, createWebhookHandler, createHostedPageHandler } from '@blinkbitcoin/kyc-node';

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

## The HTTP surface (`@blinkbitcoin/kyc-node/express`)

For a host that already runs Express and wants the kyc endpoints without
writing them: a mountable router plus the GraphQL schema. `express` is an
optional peer - only this subpath imports it.

```ts
import { createKycRouter } from '@blinkbitcoin/kyc-node/express';
import { createKycGraphQL } from '@blinkbitcoin/kyc-node';

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

## The Sumsub adapter (`@blinkbitcoin/kyc-node/sumsub`)

Everything Sumsub-specific is also on its own entry, peer-free: the client
(`createSumsubClient`, `signPayload`), `sumsubConfigFromEnv` and the
`SUMSUB_*` mapping, `createSumsubProvider`, the hosted page
(`renderSumsubPage`, `sumsubHostedPage`, the status table generated from
kyc-core's `mapSumsubStatus`). The root entry keeps re-exporting all of it;
the subpath is the canonical import for Sumsub names.

| Entry | What | Peer |
|---|---|---|
| `@blinkbitcoin/kyc-node` | everything: domain, ports, registry, handlers, pages, Sumsub + mock<br>adapters | none |
| `@blinkbitcoin/kyc-node/sumsub` | the Sumsub adapter | none |
| `@blinkbitcoin/kyc-node/express` | `createKycRouter`, `sendHostedPage` | `express` |
| `@blinkbitcoin/kyc-node/knex` | the Postgres store + migrations | `knex` (types only) |

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
| `KYC_PROVIDER` | `sumsub` or `mock` | `mock` by default (`sumsub` for<br>`accessTokenProviderFromEnv`); an unknown name<br>warns once and falls back |
| `KYC_ENV` | `production` declares a production deployment | selecting the mock or a `sbx:` Sumsub token then<br>refuses to boot (`ProductionConfigError`); never<br>`NODE_ENV`, which every image sets |
| `KYC_ALLOW_DEMO` | `true` allows demo settings in production | a production-shaped staging deployment on the sandbox |
| `MOCK_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` | the mock's webhooks | the reference backend's `.env.example` lists them |

## Development (in this monorepo)

```sh
make test        # Jest, 100% coverage enforced
make build       # tsup (ESM + CJS + types)
```

The reference host is `packages/kyc-service` (Knex store, Express + Apollo, the same
router mounted).
