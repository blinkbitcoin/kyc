# `@blinkbitcoin/kyc-service` — one deployable, tokens and sessions

**For whoever deploys and operates a backend.** If instead you own a Node API
and want it to mint in-process, that is the other tier,
[`@blinkbitcoin/kyc-node`](../kyc-node/README.md).

The whole identity-verification service as a Fetch-native app composed from
`@blinkbitcoin/kyc-node`: the access-token mint, the verification-session
domain, the hosted page, the Postgres store, the provider webhook and the
GraphQL API — with this service's session verification, CORS, rate limits,
boot guard and telemetry around them.

It is the one of two server shapes on `kyc-node` that ships as a standalone
deployable (see [`examples/`](../../examples/README.md) for the in-process
shape) and the backend the two client demos and every E2E suite run
against: `npm i @blinkbitcoin/kyc-service`, or run the `kyc-service` image
straight from GHCR.

## Capabilities, decided by the environment

| Capability | Routes | Turned on by |
|---|---|---|
| tokens | `POST /verification/token`, `GET /health` | always |
| sessions | `/graphql`, `GET /hosted/:sessionId`,<br>`POST /webhook/kyc/:provider`, the Knex store<br>and its migrations | `DATABASE_URL` |

Without `DATABASE_URL` the session routes are absent (404), no `pg`
connection is opened, no `PUBLIC_BASE_URL` and no `SUMSUB_WEBHOOK_SECRET`
are required. `GET /health` answers `{ status, capabilities, timestamp }`,
so a deployment says what it is serving. The boot guard lists every
misconfiguration at once — and the capabilities that were on — and refuses
to start.

## Deploy

Every row is the same image or the same package, the same environment
contract and the same `/health`. Templates for each live in
[`deploy/`](deploy/) and ship in the tarball; their only inputs are
environment variables.

| Target | What you deploy | Capabilities |
|---|---|---|
| Docker | `docker run -p 5100:5100 --env-file .env`<br>`ghcr.io/blinkbitcoin/kyc-service:latest`<br>(the image defaults to `KYC_ENV=production`) | tokens;<br>+ sessions<br>with a database |
| Compose | `cp deploy/docker-compose.yml .` then<br>`docker compose up -d` (`--profile postgres` adds<br>a database, `--profile migrate` applies its schema) | tokens;<br>+ sessions |
| Kubernetes | fill `deploy/k8s/secret.yaml` (the environment), then<br>`kubectl apply -k deploy/k8s` (Deployment, Service,<br>migrate Job, probes on `/health`) | tokens;<br>+ sessions |
| NixOS | copy `deploy/nix/configuration.nix` into the host<br>config, write the environment file it names, then<br>`nixos-rebuild switch` (the container runs under<br>`virtualisation.oci-containers`) | tokens;<br>+ sessions |
| Cloud Run<br>Fly, Render<br>Railway | the same image, the platform's env UI, port 5100 | tokens;<br>+ sessions |
| Lambda | the same image behind the [AWS Lambda Web<br>Adapter](https://github.com/awslabs/aws-lambda-web-adapter)<br>(`PORT=5100`, no code) | tokens;<br>+ sessions |
| Vercel | `npm i @blinkbitcoin/kyc-service`, copy<br>`deploy/vercel/` (a two-line route + `vercel.json`),<br>set the env | tokens;<br>+ sessions<br>with pooled<br>Postgres |
| Cloudflare | `npm i @blinkbitcoin/kyc-service`, copy<br>`deploy/cloudflare/` (a one-line worker +<br>`wrangler.toml` with `nodejs_compat`), set the env | tokens only |

The NixOS row is a NixOS host declaring a container; a host that merely has
Nix installed is the Docker row.

Applying the session schema is the same command everywhere:
`node dist/node.js migrate` (`npx kyc-service migrate` from the package).
Workers have no Postgres driver, so the boot guard refuses `DATABASE_URL`
there with a message that says which target to use instead.

Taking a deployment live on a production Sumsub account - the go-live
steps, the production token, the boot guard and the verification
checklist - is the runbook,
[docs/operations/production.md](../../docs/operations/production.md).

### The host's one obligation

**Say who the caller is.** Expose a JWKS endpoint (`SESSION_JWKS_URL`) or
share an HS256 secret (`SESSION_HS256_SECRET`). The verified claim
(`SESSION_USER_CLAIM`, default `sub`) becomes the user id the token is
minted for and the session is owned by — the external user id the provider
files the applicant under. Without either, the service refuses to boot
unless `ALLOW_INSECURE_DEV=true`.

## Environment

Every name means the same thing on every target; `.env.example` is the full
list with comments.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres; its presence turns sessions on |
| `PUBLIC_BASE_URL` | Where the hosted page is reachable: the URL handed to<br>clients and the `allowedOrigin` they pin postMessage<br>to. Required once sessions are on |
| `SESSION_JWKS_URL` | Remote key set (RS/ES) for session verification |
| `SESSION_ISSUER`,<br>`SESSION_AUDIENCE` | Enforced when set |
| `SESSION_USER_CLAIM` | The claim carrying the user id (default `sub`) |
| `SESSION_HS256_SECRET` | Shared secret instead of a key set (`JWT_SECRET` is<br>an accepted alias) |
| `KYC_PROVIDER` | `mock` (default) or `sumsub` |
| `SUMSUB_*` | Provider settings (`SUMSUB_WEBHOOK_SECRET` is needed<br>once sessions are on; `make sumsub-env` writes a live<br>`.env`) |
| `MOCK_WEBHOOK_SECRET` | The mock provider's webhook signing key (default `mock`) |
| `KYC_ENV` | `production` refuses demo settings (the mock, a `sbx:`<br>token) and disables introspection (`KYC_ALLOW_DEMO=true`<br>overrides). **The image sets it**, so a container refuses<br>the mock provider unless you opt out |
| `CORS_ALLOWED_ORIGINS` | Browser origins allowed to call the API |
| `ALLOW_INSECURE_DEV` | The explicit opt-in to no verification (never in<br>production); also what the forgeable mock requires |
| `OTEL_*` | Standard OpenTelemetry variables; tracing is off<br>unless set |
| `TRUST_PROXY` | `true` when a proxy you trust rewrites<br>`x-forwarded-for`: it then names the client for the<br>rate limits and for the webhook's security log.<br>Without it the header is ignored everywhere |
| `PORT`,<br>`RATE_LIMIT_*_PER_MIN` | **Container only.** A function relies on its<br>platform for the port and the limits |

## Quick Start

```sh
# From repo root, once per machine:
direnv allow . && direnv allow packages/kyc-service   # env + nix dev shell

# From this directory:
make db-up          # dev Postgres (docker, port 5432)
make migrate        # the package's migrations (src/migrate.ts)
make dev            # service at http://localhost:5100 (PORT, default KYC_PORT_BASE + 0)
```

`make help` lists all targets.

## Entry points

| Import | What you get |
|---|---|
| `@blinkbitcoin/kyc-service` | `createKycApp(env, deps) → { fetch, capabilities, stop }`<br>and the pure pieces (`validateConfig`, `sessionVerifierFromEnv`) |
| `.../node` | `startServer(env) → { url, stop }` over `@hono/node-server`,<br>with the rate limits and the SIGTERM drain |
| `.../vercel` | `export { GET, POST, OPTIONS }` for a route handler |
| `.../cloudflare` | `export default { fetch(request, env) }` for a Worker |
| `npx kyc-service` | The process entry point (`kyc-service migrate` applies<br>the schema) |

## Architecture in Brief

- **One Fetch core**: `src/app.ts` routes from the capability set. The token
  half is the package's `createAccessTokenApp`; the session half
  (`src/sessions.ts`: the Fetch webhook and hosted-page handlers, and Apollo
  over `executeHTTPGraphQLRequest`) is behind a dynamic import, so nothing
  pulls Apollo or `pg` into a tokens-only deployment — a guard test walks
  the Cloudflare entry's static import graph.
- **Provider boundary**: all Sumsub-specific code lives in
  `src/providers/sumsub/` behind the `VerificationProvider` port
  (`src/providers/port.ts`). New providers = an adapter + a registry entry
  in `src/providers/index.ts`.
- **Wire contract**: the `ErrorCode` enum in `schema.graphql` (emitted from
  `src/typeDefs.ts` via `make schema-emit`). Client packages codegen from
  it; parity tests + a CI step fail on drift.
- **Domain in the package**: authorization, validation, persist-first
  creation with an audit trail, token refresh, reconciliation and the
  webhook state machine are `createVerificationService` from
  `@blinkbitcoin/kyc-node`, composed in `src/services.ts`; resolvers never
  query inline. `approved` and `finallyRejected` are terminal: the guard is
  the store's conditional write, and a terminal session mints no more tokens.
- **ID protection**: clients only ever see internal UUIDs; the provider's
  applicant id never reaches logs, spans or the audit trail.
- **Fail-closed at boot**: `validateConfig` (`src/config.ts`) is pure - env
  in, problems out - so a container refuses to start and a function fails at
  first import, on the same rules. The image defaults to
  `KYC_ENV=production`, so the strict posture is what you get unless you
  opt out.
- **One provider per app**: `selectProvider(env)` builds the adapter an app
  mints, verifies webhooks, renders the page and resolves GraphQL with.
  There is no module-level singleton, so a Worker's bindings decide what it
  mints with and the resolvers can never run on a different adapter than
  the mint.
- **Observability**: opt-in OpenTelemetry tracing via standard `OTEL_*` env
  vars (`src/instrumentation.ts`) - http/graphql/pg/undici spans to any OTLP
  backend, or `OTEL_TRACES_EXPORTER=console` locally.

## Testing

```sh
make test           # unit tests (Vitest, DB mocked) - 100% coverage (enforced)
make migrate-test   # migrations against the tmpfs test DB (start it first:
                    #   docker compose -f ../../docker-compose.test.yml up -d --wait)
make e2e            # E2E tests against real Postgres
```

From the repo root, `make e2e-backend` runs the E2E suite with the test
database up, `make docker-build && make docker-smoke` boots the image in
both capability modes, and `make deploy-check` validates the deploy
templates.

## Key Paths

| Path | Purpose |
|------|---------|
| `src/app.ts` | The Fetch core: capabilities → routes, plus auth, CORS<br>and the security headers |
| `src/capabilities.ts` | What the environment turns on |
| `src/config.ts` | The boot guard (`validateConfig`, pure) |
| `src/session.ts` | Session verification (JWKS or HS256, via `jose`) |
| `src/sessions.ts` | The session capability: Fetch webhook, hosted page and<br>GraphQL (Node-only; reached through the loader an entry passes) |
| `src/proxy.ts` | `TRUST_PROXY`: who may be believed about the client |
| `src/server.ts` / `src/node.ts` | `startServer` (rate limits, drain) / the process entry point |
| `src/vercel.ts` / `src/cloudflare.ts` | The two function targets |
| `src/typeDefs.ts` → `schema.graphql` | GraphQL SDL → emitted schema artifact |
| `src/schema.ts` | Resolvers |
| `src/providers/port.ts` | `VerificationProvider` interface (the provider boundary) |
| `src/providers/sumsub/` / `src/providers/mock.ts` | Provider adapters (registry in `providers/index.ts`) |
| `src/services.ts` / `src/store.ts` | Domain composition (`createVerificationService`) / the<br>package's Knex `SessionStore` over `src/db.ts` |
| `src/migrate.ts` | Applies the package's migrations (`@blinkbitcoin/kyc-node/knex`) |
| `deploy/` | Deploy templates, one per target (shipped in the tarball) |
| `tests/` / `tests/e2e/` / `tests/live/` | Unit (mocked DB) / E2E (real DB) / live Sumsub (opt-in) |

## Development / migrations

The initial migration was amended in place (before any release), so a dev
database created before it gained the `locale` column will not pick up the
change via `make migrate`. Reset it: `make db-down && docker volume rm
kyc-service_postgres_data` (the volume name comes from `docker-compose.yml`; confirm
it with `docker compose -f docker-compose.yml config --volumes`), then
`make db-up && make migrate`.

Full documentation: [architecture](../../docs/architecture/backend.md) ·
[API contracts](../../docs/architecture/api-contracts.md) ·
[data models](../../docs/architecture/data-models.md) ·
[real-Sumsub setup](../../docs/integration/sumsub.md)
