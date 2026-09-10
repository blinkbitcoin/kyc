---
name: sumsub-live-verification
description: Use when running or debugging the live Sumsub verification (make sumsub-check, make test-live, make e2e-live, the Live Sumsub CI job) - what each step proves, the failure modes and their fixes, and where the manual device matrix takes over.
---

# Live Sumsub verification: running and debugging

Everything lives behind four targets (`scripts/e2e/live.sh`,
`examples/full-service-demo/scripts/sumsub-check.ts`,
`examples/full-service-demo/tests/live/sumsub.live.test.ts`; docs in
`docs/integration/sumsub.md`):

```sh
make sumsub-check   # app-token auth + the level, one throwaway 60 s token
make test-live      # the live tests alone; the service round trips need DATABASE_URL
make e2e-live       # check → E2E Postgres (:5433) → live tests → the access-token
                    #   example on :5103 (TOKEN_PORT) mints a real token → DB down
```

In CI the same runner reads the `SUMSUB_*` values from the environment (job
`E2E / Live Sumsub`, opt-in; `docs/operations/live-e2e-ci.md`).

Prerequisites locally: `examples/full-service-demo/.env` from
`make sumsub-env` (skill `sumsub-sandbox-setup`), Docker for the E2E
Postgres, nothing else - no device, no browser, no build.

## What each step proves

| Step | Proves |
|---|---|
| `sumsub-check` | `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY` are accepted by `SUMSUB_BASE_URL` and `SUMSUB_LEVEL_NAME` exists |
| `Sumsub API (live)` | the access-token contract (`{ token, userId }` echoing the external user id) the native SDK and `examples/access-token-demo` rely on; a user with no applicant answers 404 to the external-user-id lookup, which is what `getStatusByUserId` turns into `initial` |
| `the service on the Sumsub provider (live)` | `verificationSessionStart` mints a real token (applicant `null`: Sumsub creates it when the SDK opens), `verificationSessionRefresh` mints another, `verificationSession` reconciles to `initial`, `GET /hosted/<id>` renders the Sumsub page for the real token; a webhook signed with `SUMSUB_WEBHOOK_SECRET` and `SUMSUB_WEBHOOK_DIGEST_ALG` is accepted, binds the applicant and approves the session |
| `server demos smoke (sumsub)` | the access-token example composes the package correctly against the real provider |

Sessions from a local run land in the tmpfs E2E database (dropped by
`test-db-down`); a `make test-live` against a dev `DATABASE_URL` leaves its
`live-*` rows there, which is harmless.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `sumsub check: missing SUMSUB_…` | no `.env` and nothing in the environment | `make sumsub-env` |
| `no examples/full-service-demo/.env (make sumsub-env) and no SUMSUB_* in the environment` | `live.sh` found neither | same |
| `HTTP 401 … not accepted` | wrong token/secret, wrong base URL for that token, or the token was revoked | regenerate (skill `sumsub-sandbox-setup`, step 2) |
| `HTTP 4xx … SUMSUB_LEVEL_NAME` | the level name is not in this sandbox | the exact name from the dashboard |
| `[live] Skipping … missing:` in `make test-live` | the `.env` has no `SUMSUB_WEBHOOK_SECRET` (the check does not need it, the tests do) | add it |
| `[live] DATABASE_URL is not set` | `make test-live` outside `e2e-live` | `make e2e-live`, or export a `DATABASE_URL` and migrate |
| the signed-webhook test answers `401` | `SUMSUB_WEBHOOK_DIGEST_ALG` in the `.env` is not what the test should sign with, or the secret differs from the dashboard's | set both from the webhook's settings |
| the signed-webhook test answers `200` with outcome `unknown_session` | the session row was not found by external user id (a stale DB, or `PUBLIC_BASE_URL` pointing at another instance) | run inside `e2e-live` (fresh DB) |
| `port 5103 is taken` / the example never answers | a stale example process | `TOKEN_PORT=5113 make e2e-live` |
| `server demos smoke: access-token mutation (sumsub)` fails with `SESSION_CREATION_FAILED` while the check passed | the example's tier maps onto a level this account does not have | `KYC_LEVEL_BASIC=<a level of this account>` (the smoke defaults it to `SUMSUB_LEVEL_NAME`) |
| `server demos smoke: access-token mutation (sumsub)` fails otherwise | the example reads `SUMSUB_*` from the environment, not the `.env` | `live.sh` exports the `.env`; run through it |

Every live pass is recorded in `docs/integration/sumsub-lessons.md` (the
first, 2026-09-10 against Blink's sandbox: level names are per account -
the example's tier table became environment-driven).

## Where the manual matrix takes over

Everything with a camera: the native SDK screens, permission prompts,
liveness, token expiry inside the SDK, the WebView on a phone, Safari.
`docs/integration/sumsub.md` sections 3-5, ~90 minutes on two physical
devices and two browsers, with a public `PUBLIC_BASE_URL` so real webhooks
arrive (2.3). Record the result per release as the doc's last section says.
