# Upgrading

What changes for you between kyc releases, by audience. Entries are listed
newest first; each names the pull request that made the change.

## `getStatusByUserId` answers with the applicant id too

For whoever implements a `VerificationProvider` of their own: the optional
`getStatusByUserId(userId)` capability now resolves to
`{ status, providerApplicantId? }` instead of a bare status, so a
reconciling read can bind the session to the applicant the provider filed
the user under without waiting for a webhook. The Sumsub adapter fills it
from the applicant lookup; a provider that has no applicant yet returns
`{ status: 'initial' }`. Hosts that only consume the packages see no change.

`createVerificationService` also takes `hostedUrlFor(sessionId)` for a
hosted page served under the host's own path or domain; the default
`<publicBaseUrl>/hosted/<id>` is unchanged.

## The service is Fetch-native: Express is gone

`@blinkbitcoin/kyc-service` is one Fetch handler, `createKycApp(env, deps)`,
behind a thin Node bridge (`@hono/node-server`) on the container and behind
each function platform's entry shape otherwise. What changes for whoever runs
it:

| Before | After |
|---|---|
| `createApp()` (an Express app) | `createKycApp(env, deps) → { fetch, capabilities, stop }`;<br>on Node, `startServer(env) → { url, stop }` from `.../node` |
| `node dist/index.js` | `node dist/node.js` (also `npx kyc-service`) |
| `node dist/migrate.js` | `node dist/node.js migrate` |
| `validateSecurityConfig()` | `validateConfig(env, { runtime })` - pure, lists every<br>problem at once with the capabilities that are on |
| `NODE_ENV=production` | decides nothing. `KYC_ENV=production` is the production<br>switch: it refuses the mock provider and a `sbx:` token<br>(`KYC_ALLOW_DEMO=true` overrides) and turns introspection off |
| `JWT_SECRET` | still accepted, as an alias of `SESSION_HS256_SECRET`;<br>`SESSION_JWKS_URL` is the new keyless source |
| always on | capabilities: access tokens always, sessions only with<br>`DATABASE_URL` (`PUBLIC_BASE_URL` and the webhook secret are<br>required only then); `/health` reports which are on |
| `POST /verification/token` did not exist | the tokens capability's one route: the package's<br>`createAccessTokenApp` preset, so mode 1 needs no GraphQL |

The session routes (`/graphql`, `GET /hosted/:sessionId`,
`POST /webhook/kyc/:provider`), their status codes, bodies and headers are
unchanged, and so are the `make` targets and the E2E stack.

## The service is a package: `examples/full-service-demo` → `packages/kyc-service`

The reference backend moves out of `examples/` and is published as
`@blinkbitcoin/kyc-service` (`packages/kyc-service/`), the one deployable of
the repo, next to the library it composes. Same env names, routes and
`make` targets (`make db-up migrate backend`, `make e2e-backend`); only the
path changes. The Postgres dev volume follows the directory name:
`kyc-service_postgres_data`.

## Package rename: `kyc-server` → `kyc-node`

`@blinkbitcoin/kyc-server` (`packages/kyc-server/`) is renamed
`@blinkbitcoin/kyc-node` (`packages/kyc-node/`), matching the platform naming
of `kyc-react` / `kyc-react-native` and the sibling `esign-node`. No aliases -
update every import from `@blinkbitcoin/kyc-server` (and its `/express`,
`/knex`, `/sumsub` subpaths) to `@blinkbitcoin/kyc-node`. The registry scope
in `.npmrc` (`@blinkbitcoin:registry=...`) is unchanged. The commitlint scope
`server` is renamed `node` in the same change.
