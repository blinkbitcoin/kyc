# kyc-full-service-example

Reference identity-verification backend (Express 5 + Apollo Server 5 +
Knex/Postgres).

## Surface

| Route | Purpose |
|-------|---------|
| `GET /health` | Liveness |
| `POST /graphql` | `verificationSessionStart`, `verificationSessionRefresh`,<br>`verificationSession`, `health` |
| `GET /hosted/:sessionId` | The hosted verification page (provider web SDK wrapped in the<br>`kyc-bridge` protocol) |
| `POST /webhook/kyc/:provider` | Signed provider callbacks; only the configured provider is accepted |

## Providers

`KYC_PROVIDER` selects the adapter behind `src/providers/port.ts`:

- `mock` (default) - deterministic tokens, an in-memory applicant map and a
  self-signed webhook (`X-Mock-Signature`). Every E2E flow runs against it.
  Because that webhook is forgeable by anyone who can reach the route, the
  process refuses to start on `mock` unless `ALLOW_INSECURE_DEV=true`.
- `sumsub` - app-token HMAC signing against `https://api.sumsub.com`,
  `X-Payload-Digest` webhook verification, and the Sumsub Web SDK on the
  hosted page. Requires `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` and
  `SUMSUB_WEBHOOK_SECRET`; the server refuses to start without them.

## Rules that matter

- Fail-closed boot (`src/config.ts`): `JWT_SECRET`, the Sumsub credentials
  when `KYC_PROVIDER=sumsub`, and a `PUBLIC_BASE_URL` that is set and is an
  absolute `http:`/`https:` URL - there is no localhost fallback outside
  insecure dev. Bypass for local dev only with `ALLOW_INSECURE_DEV=true`,
  which is also what `KYC_PROVIDER=mock` requires.
- Terminal statuses (`packages/kyc-node/src/sessions.ts` over the store's
  conditional write): `approved` and `finallyRejected`
  never change. `declined` may move on - a Sumsub RETRY rejection lets the
  applicant resubmit. The guard is the UPDATE's own WHERE clause
  (`applyStatusTransition`), so concurrent webhook deliveries cannot race
  past it, and a terminal session mints no more tokens: `GET /hosted/:id`
  renders the not-found page and `verificationSessionRefresh` fails with
  `VALIDATION_ERROR`.
- The audit log (the package's `audit.ts` allow-list, applied by the store)
  passes metadata through nine keys;
  applicant data never reaches it, nor the tracing spans.
- `locale` from `verificationSessionStart` is persisted on the session and
  drives the hosted page's SDK language; accepted shapes are `en` and
  `en-US`.
- A non-terminal session self-heals on `verificationSession`: bound sessions
  ask the provider about their applicant, unbound ones use the optional
  user-id lookup, and the answer is applied through the same conditional
  write the webhook path uses. A provider failure leaves the stored status
  untouched.
- The hosted page's session id is a bearer capability: it is handed to one
  client, the page is `no-store`, and its token is minted per render.

`make help` lists the local targets; the repo-wide flow is `make e2e-backend`
at the root.

## Development / migrations

The initial migration was amended in place (before any release), so a dev
database created before it gained the `locale` column will not pick up the
change via `make migrate`. Reset it: `make db-down && docker volume rm
kyc-service_postgres_data` (the volume name comes from `docker-compose.yml`; confirm
it with `docker compose -f docker-compose.yml config --volumes`), then
`make db-up && make migrate`.
