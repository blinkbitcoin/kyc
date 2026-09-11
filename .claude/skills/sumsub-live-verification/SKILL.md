---
name: sumsub-live-verification
description: Use when running or debugging the live Sumsub verification (make sumsub-check, make test-live, make e2e-live, the Live Sumsub CI job) - what each step proves, the failure modes and their fixes, and where the manual device matrix takes over.
---

# Live Sumsub verification: running and debugging

Everything lives behind four targets (`scripts/e2e/live.sh`,
`packages/kyc-service/scripts/sumsub-check.ts`,
`packages/kyc-service/tests/live/sumsub.live.test.ts` and
`sumsub-submission.live.test.ts` over `sumsub-sandbox.ts`; docs in
`docs/integration/sumsub.md`):

```sh
make sumsub-check   # app-token auth + the level, one throwaway 60 s token
make test-live      # the live tests alone; the service round trips need DATABASE_URL
make e2e-live       # check → E2E Postgres (:5433) → live tests → the access-token
                    #   example on :5103 (TOKEN_PORT) mints a real token → DB down
make live-web       # public URL (Tailscale Funnel) + backend on the sandbox + web demo,
                    #   waits for section 5 in a browser, Ctrl-C tears down
make live-ios       # + Metro (KYC_MODE, KYC_API_HOST = the Mac's tailnet ip) + the app
                    #   on the attached iPhone: section 4 (hosted) / 3 (native)
make live-android   # + adb reverse + Metro + the APK on the attached Android phone
```

In CI the same runner reads the `SUMSUB_*` values from the environment (job
`E2E / Live Sumsub`, opt-in; `docs/operations/live-e2e-ci.md`).

Prerequisites locally: `packages/kyc-service/.env` from
`make sumsub-env` (skill `sumsub-sandbox-setup`), Docker for the E2E
Postgres, nothing else - no device, no browser, no build.

## What each step proves

| Step | Proves |
|---|---|
| `sumsub-check` | `SUMSUB_APP_TOKEN` / `SUMSUB_SECRET_KEY` are accepted by `SUMSUB_BASE_URL` and `SUMSUB_LEVEL_NAME` exists |
| `Sumsub API (live)` | the access-token contract (`{ token, userId }` echoing the external user id) the native SDK and `examples/access-token-demo` rely on; a user with no applicant answers 404 to the external-user-id lookup, which is what `getStatusByUserId` turns into `initial` |
| `the service on the Sumsub provider (live)` | `verificationSessionStart` mints a real token (applicant `null`: Sumsub creates it when the SDK opens), `verificationSessionRefresh` mints another, `verificationSession` reconciles to `initial`, `GET /hosted/<id>` renders the Sumsub page for the real token; a webhook signed with `SUMSUB_WEBHOOK_SECRET` and `SUMSUB_WEBHOOK_DIGEST_ALG` is accepted, binds the applicant and approves the session |
| `a real applicant through the Sumsub sandbox (live)` | four actual verifications: the applicant the test creates (as the SDK would, on `SUMSUB_E2E_LEVEL_NAME`) with Sumsub's passport template uploaded and the check requested is found by external user id and bound (`pending`); the sandbox review simulation then drives GREEN → `approved` (refresh `VALIDATION_ERROR`, page 404), RED/RETRY → `declined` → GREEN → `approved`, RED/FINAL → `finallyRejected` + a later signed GREEN answered `rejected_terminal`, and a reset on Sumsub leaves `approved` alone. Every write went through `applyStatusTransition` (`api` from the reconciling read, `webhook` when the funnel is up) |
| `server demos smoke (sumsub)` | the access-token example composes the package correctly against the real provider |

Sessions from a local run land in the tmpfs E2E database (dropped by
`test-db-down`); a `make test-live` against a dev `DATABASE_URL` leaves its
`live-*` rows there, which is harmless.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `sumsub check: missing SUMSUB_…` | no `.env` and nothing in the environment | `make sumsub-env` |
| `no packages/kyc-service/.env (make sumsub-env) and no SUMSUB_* in the environment` | `live.sh` found neither | same |
| `HTTP 401 … not accepted` | wrong token/secret, wrong base URL for that token, or the token was revoked | regenerate (skill `sumsub-sandbox-setup`, step 2) |
| `HTTP 4xx … SUMSUB_LEVEL_NAME` | the level name is not in this sandbox | the exact name from the dashboard |
| `[live] Skipping … missing:` in `make test-live` | the `.env` has no `SUMSUB_WEBHOOK_SECRET` (the check does not need it, the tests do) | add it |
| `[live] DATABASE_URL is not set` | `make test-live` outside `e2e-live` | `make e2e-live`, or export a `DATABASE_URL` and migrate |
| the signed-webhook test answers `401` | `SUMSUB_WEBHOOK_DIGEST_ALG` in the `.env` is not what the test should sign with, or the secret differs from the dashboard's | set both from the webhook's settings |
| the signed-webhook test answers `200` with outcome `unknown_session` | the session row was not found by external user id (a stale DB, or `PUBLIC_BASE_URL` pointing at another instance) | run inside `e2e-live` (fresh DB) |
| `port 5103 is taken` / the example never answers | a stale example process | `TOKEN_PORT=5113 make e2e-live` |
| `server demos smoke: access-token mutation (sumsub)` fails with `SESSION_CREATION_FAILED` while the check passed | the example's tier maps onto a level this account does not have | `KYC_LEVEL_BASIC=<a level of this account>` (the smoke defaults it to `SUMSUB_LEVEL_NAME`) |
| `server demos smoke: access-token mutation (sumsub)` fails otherwise | the example reads `SUMSUB_*` from the environment, not the `.env` | `live.sh` exports the `.env`; run through it |
| a submission test: `HTTP 403: … "User not authorized."` on `POST /resources/applicants` | the App Token has no *Create applicants* permission (a dashboard user without it cannot grant it) | a token generated with it, `make sumsub-env … FORCE=1` |
| a submission test: `HTTP 409` on `status/pending` ("not all required documents") | the level has a step an API upload cannot satisfy (liveness/selfie) | `E2E_LEVEL_NAME=<document-only level>` (`SUMSUB_E2E_LEVEL_NAME`) |
| a submission test: `only supported on sandbox env` | a production App Token | the sandbox one - never run this against production |
| a submission test times out `waiting for the session to reach pending` | the reconciling read cannot find the applicant: the level or the external user id differ from what the test created | the `[live] POST /resources/applicants …` line says which; fresh DB (`e2e-live`) |
| `[live] approved:webhook` never appears locally | `PUBLIC_BASE_URL` is not public, so Sumsub's webhooks do not arrive (the read carries the run) | fine; for the webhook half export the funnel URL (`scripts/e2e/live-stack.sh`) |

Every live pass is recorded in `docs/integration/sumsub-lessons.md` (the
first, 2026-09-10 against Blink's sandbox: level names are per account -
the example's tier table became environment-driven).

## Where the manual matrix takes over

Everything with a camera: the native SDK screens, permission prompts,
liveness, token expiry inside the SDK, the WebView on a phone, Safari. The
state half of rows 3.5-3.8 is automated (above); the rows stay for the
embedding.
`docs/integration/sumsub.md` sections 3-5, ~90 minutes on two physical
devices and two browsers, with a public `PUBLIC_BASE_URL` so real webhooks
arrive (2.3). Record the result per release as the doc's last section says.
