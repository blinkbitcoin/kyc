# @blinkbitcoin/kyc-server

The server half of identity verification, for Node. A backend that already
exists (Blink's GraphQL API) imports it to mint Sumsub access tokens, verify
Sumsub webhooks and keep a verification session's status - without running
a second service. The reference backend in this repo is built on it.

**Status: being extracted from `apps/api`.** The framework-free primitives
below are in; the verification-session domain, the mock and Sumsub adapters,
the hosted page, the Fetch handlers, the Express router and the Knex store
land next, on the entries the package already declares.

| Import | Contents | Peer needed |
|--------|----------|-------------|
| `@blinkbitcoin/kyc-server` | The domain vocabulary, the `VerificationProvider` port<br>and its capabilities, `KycError` + `ErrorCodes`, the webhook<br>signature primitive, HTTP retry, the HTML sinks, the hosted<br>page's neutral layer, validation, `bearerToken`, the<br>`Logger` and `Tracing` ports | none |
| `@blinkbitcoin/kyc-server/express` | `createKycRouter` (follows) | `express` |
| `@blinkbitcoin/kyc-server/knex` | `createKnexSessionStore`, `runKycMigrations` (follow) | `knex` |
| `@blinkbitcoin/kyc-server/sumsub` | `createSumsubProvider`, the Sumsub client and page (follow) | none |

The package reaches `@blinkbitcoin/kyc-core` only through its Apollo-free
`/sumsub` and `/hosted` entries (guard-tested), so a backend never installs
`@apollo/client` or `graphql` for it.

## Development (in this monorepo)

`make test` / `make coverage` (100% enforced) / `make typecheck` / `make build`
in this directory, or the same targets fanned out from `packages/`.
