# Architecture - Backend (`@blinkbitcoin/kyc-node`, composed by `examples/full-service-demo`)

**Part:** backend
**Type:** a Node package (ports and adapters) plus the Express 5 + Apollo Server 5 service built on it
**Updated:** 2026-09-10

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Package | `@blinkbitcoin/kyc-node` (tsup, cjs + esm + dts) | Node ≥ 18, framework-free root |
| Framework (service) | Express | 5.x |
| GraphQL (service) | Apollo Server | 5.x |
| Language | TypeScript | 6.0.x |
| Query builder | Knex.js | 3.3.x (optional peer of the package) |
| Database | PostgreSQL | 15+ |
| Testing | Jest (package), Vitest (service) | 100% thresholds on both |
| HTTP testing | Supertest | 7.x |
| Tracing | OpenTelemetry API + SDK (service only) | off unless configured |
| Lint/format | ESLint + Biome (package), Biome (service) | - |
| Dev runner | tsx (watch) | 4.x |

## Architecture pattern

**Ports and adapters in the package, composition in the service.** The package owns every rule; the service owns deployment policy (secrets, auth, rate limits, tracing) and wires the package into Express and Apollo.

```
HTTP request
    ↓
examples/full-service-demo: Express (helmet, per-route rate limit, CORS), Apollo, JWT, OTel
    ↓
@blinkbitcoin/kyc-node: createVerificationService  ──►  SessionStore port  ──►  /knex store  ──►  PostgreSQL
    ↓                                                       (or the in-memory store)
VerificationProvider port  ──►  providers/sumsub (Sumsub REST) | providers/mock
```

Two host shapes use the same package: the full service here, and an existing API that only mints access tokens for the native SDK (`examples/access-token-demo` - one mutation, one `provider.createSession` call, no store).

## Entry points

| Import | Contents | Needs |
|--------|----------|-------|
| `@blinkbitcoin/kyc-node` | `createVerificationService`, the `VerificationProvider` / `SessionStore` / `Tracing` / `Logger` ports, `createMemorySessionStore`, the mock provider, the registry (`providerFromEnv`, `defaultRegistry`), `typeDefs` + `createKycGraphQL`, the Fetch handlers and the `*Http` decision functions, `KycError` + `ErrorCodes`, `verifyHexDigest`, `withRetry`, the hosted-page primitives | nothing (Node ≥ 18) |
| `@blinkbitcoin/kyc-node/express` | `createKycRouter` (`/health`, `/hosted/:sessionId`, `/webhook/kyc/:provider`) | `express` (optional peer) |
| `@blinkbitcoin/kyc-node/knex` | `createKnexSessionStore`, `KYC_MIGRATIONS`, `createKycMigrationSource`, `runKycMigrations` | `knex` (optional peer) |
| `@blinkbitcoin/kyc-node/sumsub` | `createSumsubProvider`, `createSumsubClient`, `sumsubConfigFromEnv`, `assertSumsubConfig`, `sumsubHostedPage`, `buildSumsubStatusTable` | nothing |

`packages/kyc-node/README.md` documents each surface; nothing reachable from any entry imports Apollo or `graphql` (guard test + `scripts/pack-smoke.sh`).

## Source structure

The package (`packages/kyc-node/src/`):

| Path | Role |
|------|------|
| `sessions.ts` | `createVerificationService`: start, refresh, status, `handleWebhookEvent`, the hosted-page decision, and `applyStatusTransition` - the **single write path** every status change goes through (guard-tested) |
| `store.ts` / `knex/store.ts` | The `SessionStore` port with the in-memory implementation, and the Knex implementation |
| `knex/migrations.ts` | The programmatic migration source (see [data-models.md](data-models.md)) |
| `provider.ts` | The `VerificationProvider` port, the `HostedPageRenderer` capability, `supportsUserStatusLookup` / `supportsHostedPage` |
| `providers/mock/{provider,page}.ts` | The deterministic provider (per-handle applicant map, `signWebhook`, `setApplicantStatus`) and its page |
| `providers/sumsub/{config,client,provider,page}.ts` | SUMSUB_* config, the app-token-signed REST client with retries, the adapter, the page over the Sumsub web SDK |
| `registry.ts` | `ProviderRegistry`, `providerFromEnv` / `providerNameFromEnv` keyed by `KYC_PROVIDER`, `defaultRegistry` |
| `graphql.ts` | The SDL (`typeDefs`) and `createKycGraphQL({ sessions })` - resolvers that map I/O only |
| `handlers.ts` / `express.ts` | Framework-neutral Fetch handlers and `*Http` decisions; the Express router over them |
| `pages.ts` / `html.ts` / `bridge/script.ts` | The hosted page's neutral layer: params, nonce CSP, permissions policy, not-found page; escaping; the `kyc-bridge` page script |
| `errors.ts` / `validation.ts` / `signature.ts` / `http.ts` / `audit.ts` / `auth.ts` / `log.ts` / `tracing.ts` | `KycError` + `ErrorCodes`, `validateStartInput`, `verifyHexDigest`, `HttpError` + `withRetry`, the audit vocabulary and allow-list, `bearerToken`, the `Logger` and `Tracing` ports |

The service (`examples/full-service-demo/src/`), composition only:

| Path | Role |
|------|------|
| `app.ts` | helmet, CORS allow-list, per-route rate limits, JWT → `userId`, Apollo over `createKycGraphQL`, `createKycRouter` mounted |
| `services.ts` / `store.ts` / `migrate.ts` | The service instance over the Knex store; `runKycMigrations` |
| `providers/{index,mock,sumsub/*}.ts` | The service's registry: the package adapters wired to its config and policy (`assertMockProviderAllowed`, `validateConfig` fail-fast), each wrapped in tracing |
| `config.ts` / `auth.ts` / `server.ts` / `index.ts` | `validateSecurityConfig`, CORS origins, `PUBLIC_BASE_URL`; JWT; boot (fail-closed) and the process entry |
| `tracing.ts` / `instrumentation.ts` | `withSpan`, `instrumentProvider`, the OTel bootstrap |
| `schema.ts` / `typeDefs.ts` / `errors.ts` / `types.ts` / `providers/port.ts` | Thin re-exports of the package (the SDL re-export is what `schema:emit` reads) |

## Provider port

```ts
export interface VerificationProvider {
  createSession(userId: string, opts: CreateSessionOptions): Promise<ProviderSession>;
  refreshToken(subject: TokenSubject, opts: CreateSessionOptions): Promise<ProviderToken>;
  getStatus(providerApplicantId: string): Promise<VerificationStatus>;
  verifyWebhook(headers: WebhookHeaders, rawBody: string, ip?: string): boolean;
  parseWebhookEvent(rawBody: string): WebhookEvent | null;
  getStatusByUserId?(userId: string): Promise<VerificationStatus>;
  hostedPage?: HostedPageRenderer;
}
```

`getStatusByUserId` and `hostedPage` are **optional capabilities**, detected with `supportsUserStatusLookup` / `supportsHostedPage` - the same Interface-Segregation shape the client packages use for `isLaunchable` / `isTokenRefreshable`. No generic layer branches on a provider name: the status query uses the lookup when it exists, the hosted route renders the provider's page when it exists and the not-found page otherwise.

The service's `instrumentProvider(provider, name)` wraps every method in a span (`kyc.provider.create_session`, `…refresh_token`, `…get_status`, `…get_status_by_user_id`, `…verify_webhook`, `…parse_webhook_event`) so observability is a decorator on the service side, never a concern of an adapter.

### Implementations

| Provider | Selected by | Notes |
|----------|-------------|-------|
| `mock` | `KYC_PROVIDER=mock` (default, and any unknown value, with a warning) | Deterministic ids (`mock-applicant-<uuid>`, `mock-token-<uuid>`), a per-handle applicant map, and a hosted page whose buttons POST **signed** webhooks back. The service refuses to boot it without `ALLOW_INSECURE_DEV=true` - it signs its own webhooks with a key that defaults to `"mock"` and is therefore forgeable |
| `sumsub` | `KYC_PROVIDER=sumsub` | The service refuses to boot without `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` and `SUMSUB_WEBHOOK_SECRET` (`assertSumsubConfig`) |

The Sumsub adapter owns no mapping of its own: `mapSumsubStatus` and `mapSumsubWebhookStatus` come from `@blinkbitcoin/kyc-core/sumsub`, so the backend, the native SDK source and the hosted page can never disagree about what `completed` + `RED` + `FINAL` means. Nothing outside `providers/` names Sumsub (guard test).

## GraphQL API

Three operations plus `health`: `verificationSessionStart`, `verificationSessionRefresh`, `verificationSession`. Every field, argument and error code is in [api-contracts.md](api-contracts.md).

[![GraphQL Request Flow](../diagrams/dist/graphql-request-flow.svg)](../diagrams/src/graphql-request-flow.mmd)

Three rules the service layer states, and the resolvers only relay:

- **Persist first, then call the provider.** The row and its `session_created` audit entry are written *before* the provider is contacted, so a provider outage still leaves an auditable trail (`creation_failed` with the coded reason) instead of a silent gap.
- **Ownership is checked on every read.** `verificationSession` and `verificationSessionRefresh` load by `(id, userId)`; a session belonging to someone else is indistinguishable from a missing one (`SESSION_NOT_FOUND`). A terminal session refuses a refresh (`VALIDATION_ERROR`) rather than minting a live token for a decision that cannot change.
- **`verificationSession` self-heals a non-terminal session.** When the stored status is not `approved`/`finallyRejected`, the service asks the provider (`getStatus(applicantId)` once an applicant id is bound, else `getStatusByUserId` when supported) and applies any change through `applyStatusTransition`. Best-effort reconciliation, not the source of truth - **webhooks are** - and a lookup failure leaves the stored status in place.

## Webhook processing

`POST /webhook/kyc/:provider` is rate-limited (120/min) and reads the body as **text**, not JSON, because the signature is over the raw bytes.

[![Webhook Flow](../diagrams/dist/webhook-flow.svg)](../diagrams/src/webhook-flow.mmd)

| Outcome | When |
|---------|------|
| `ignored_unknown_status` | The payload carries a type this repo does not act on (e.g. `applicantWorkflowCompleted`) |
| `unknown_session` | Neither the applicant id nor the external user id resolves to a session |
| `unchanged` | The stored status already equals the incoming one |
| `rejected_terminal` | The stored status is `approved` or `finallyRejected` - recorded as a `webhook_rejected` audit entry with `reason: 'terminal_status'` |
| `rejected_unbound` | The event is the first one for a session (matched by `externalUserId`), but the applicant id it carries does not match the one the bind attempt found on that session - `webhook_rejected` with `reason: 'applicant_mismatch'` |
| `updated` | Bind (when this is the first event for the session) + the conditional status write + `status_updated` audit, in one transaction |

All six answer `200` with `{ received: true, outcome }`: a provider retry loop is not an error signal. Only signature failure (`401`), an unparseable body (`400`), an unknown or non-configured provider (`404`) and a genuine processing failure (`500`, which Sumsub retries) diverge.

**The route 404s unless the `:provider` segment is both a known provider and the configured one**, so a mock payload can never drive a Sumsub deployment.

## The hosted page

`GET /hosted/:sessionId` (rate-limited 60/min) renders a single-purpose HTML page from the provider's `hostedPage` renderer:

- A session that is unknown, belongs to a different provider than the one configured, or is already terminal gets the not-found page (`404`), which emits `sessionExpired` over the bridge so the embedding component shows Restart rather than hanging on a session that can no longer progress.
- The access token is minted **fresh on every render** through `provider.refreshToken`; a failure is a `502`, rendered as the same not-found page.
- A per-request nonce drives a strict CSP (`hostedPageCsp`): `default-src 'none'`, `script-src 'nonce-…'` plus the provider's script host, the provider's `connect-src` / `frame-src` / `img-src` hosts, `media-src blob: mediastream:`, `style-src 'nonce-…'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors *`. The mock page gets the same shape with no provider hosts.
- `Permissions-Policy` (`DEFAULT_PERMISSIONS_POLICY`) delegates camera and microphone to the provider frame.
- `X-Frame-Options` and the three `Cross-Origin-*` headers are explicitly **removed** on this route: the page exists to be embedded. `frame-ancestors *` is deliberate - the client-side origin pin is what actually authenticates the channel, and an embedder allow-list would have to be configured per host app.
- The page emits `kyc-bridge` envelopes and accepts `setToken` in either transport. The Sumsub page translates `idCheck.onApplicantLoaded` / `onApplicantSubmitted` / `onApplicantStatusChanged` / `onError` into normalized events using a status table *generated* from the shared mapping (`buildSumsubStatusTable`), so the page and the backend cannot drift. `locale` (validated and persisted at session-start time) is passed to the Sumsub SDK's `withConf({ lang })`, defaulting to `'en'`.

## Security features

Fail-closed boot (`validateSecurityConfig`: JWT secret, the Sumsub credentials, an absolute `PUBLIC_BASE_URL`), the single `ALLOW_INSECURE_DEV=true` escape hatch, HS256 JWT verification with the raw-token fallback only in insecure dev, webhook signatures over the raw body with a constant-time compare and an algorithm allow-list, the provider-scoped webhook route, the origin pin on the client side, the hosted page's nonce CSP, rate limits per route, a 64 kb body limit, and no PII in logs, spans or the audit trail (a nine-key metadata allow-list). The threat model and each control's rationale are in [security.md](security.md).

## Observability

The OTel SDK starts only when configured; the `@opentelemetry/api` facade makes every span a no-op otherwise, so `withSpan` is safe to use unconditionally. The package exposes a `Tracing` port (`noopTracing` by default) the service fills with its OTel spans. Span attributes are ids, statuses and types - `kyc.provider`, `enduser.id`, `kyc.platform`, `kyc.session_id`, `kyc.status`, `kyc.webhook.raw_status`, `kyc.webhook.outcome`. **Provider applicant ids are never span attributes**, and no applicant name, document or image ever reaches a log line or a span.

## Database schema

`VerificationSession` and `AuditLog` - see [data-models.md](data-models.md).

## Testing strategy

- **Package unit (Jest, 100% s/b/f/l):** the service over the in-memory store and fake providers, the Knex store's SQL through `knex-mock-client` (`FOR UPDATE`, the terminal guard inside the `UPDATE`), the migrations' exact columns and literal name, the Sumsub client over an injected `fetch`, the status table's full-vocabulary equality with `mapSumsubStatus`, the handlers with `Request`/`Response`, the router with supertest; plus the guards: core-boundary (never core's root, never Apollo), provider-boundary (only the registry, the index and `sumsub.ts` may import `providers/`), single-write-path, the Sumsub barrel.
- **Service unit (Vitest, 100%):** the composition - what the service adds: config validation, JWT, the registry's policy, tracing, the app's middleware.
- **E2E (Vitest + dockerized Postgres on `KYC_TEST_DB_PORT`, base + 4 = 5104, `make e2e-backend`):** session start / refresh / status, the signed webhook and its state machine, the hosted page's rendered bridge script, with the package's migrations applied to a real database.
- **Live (opt-in, `make e2e-live`):** the same against the real Sumsub sandbox API - [../operations/live-e2e-ci.md](../operations/live-e2e-ci.md).

## Environment variables

See [../development-guide.md](../development-guide.md#environment-variables-reference) for the full table and [security.md](security.md) for which of them are fail-closed.
