# api

Reference identity-verification backend (Express 5 + Apollo Server 5 +
Knex/Postgres).

## Surface

| Route | Purpose |
|-------|---------|
| `GET /health` | Liveness |
| `POST /graphql` | `verificationSessionStart`, `verificationSessionRefresh`, `verificationSession`, `health` |
| `GET /hosted/:sessionId` | The hosted verification page (provider web SDK wrapped in the `kyc-bridge` protocol) |
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
- Terminal statuses (`src/session.ts`): `approved` and `finallyRejected`
  never change. `declined` may move on - a Sumsub RETRY rejection lets the
  applicant resubmit. The guard is the UPDATE's own WHERE clause
  (`applyStatusTransition`), so concurrent webhook deliveries cannot race
  past it, and a terminal session mints no more tokens: `GET /hosted/:id`
  renders the not-found page and `verificationSessionRefresh` fails with
  `VALIDATION_ERROR`.
- The audit log (`src/audit.ts`) passes metadata through a key allow-list;
  applicant data never reaches it, nor the tracing spans.
- The hosted page's session id is a bearer capability: it is handed to one
  client, the page is `no-store`, and its token is minted per render.

`make help` lists the local targets; the repo-wide flow is `make e2e-backend`
at the root.
