---
name: sumsub-sandbox-setup
description: Use when a Sumsub sandbox needs to be prepared for this repo (first live run, a new machine, a new sandbox, the CI environment) - the level, the App Token and its secret, the webhook and its digest algorithm, a public URL for the device matrix, and `make sumsub-env` / `make sumsub-check` to write and verify examples/full-service-demo/.env.
---

# Sumsub sandbox setup

What the live tooling (`make e2e-live`, the `Live Sumsub` CI job) and the
manual device matrix need from a Sumsub **sandbox**, and how to get it. The
secrets never pass through a chat: write them with `make sumsub-env`, which
puts them in the gitignored `examples/full-service-demo/.env` with mode 600.

## 1. The level

Dashboard → Integrations → Verification levels. Pick or create the level
the backend will mint tokens for; the repo default is `basic-kyc-level`
(`SUMSUB_LEVEL_NAME`). For the automated tier any existing level works; for
the device matrix it must include an **identity document and a
liveness/selfie step** - a document-only level never opens the camera and
makes every camera check pass vacuously. Record the exact name.

## 2. The App Token

Dev space → App Tokens → Generate. Record the token
(`SUMSUB_APP_TOKEN`) and the **secret key** (`SUMSUB_SECRET_KEY`) - the
secret is shown once. For CI make a second token, separate from any
developer's, so it can be revoked on its own.

## 3. The webhook

Dev space → Webhooks → Create: URL `<PUBLIC_BASE_URL>/webhook/kyc/sumsub`,
method POST, subscribed to at least `applicantReviewed`, `applicantPending`,
`applicantCreated`, `applicantOnHold`, `applicantReset`. Record the webhook
**secret key** (`SUMSUB_WEBHOOK_SECRET`) and the **digest algorithm** it
signs with (`SUMSUB_WEBHOOK_DIGEST_ALG`: `HMAC_SHA256_HEX` by default,
`HMAC_SHA1_HEX` or `HMAC_SHA512_HEX`). The backend reads the algorithm from
the `x-payload-digest-alg` header on every request; only the live test needs
to know it, because it signs its own webhook with the same secret. The
automated tier never waits for Sumsub to call back, so for CI the URL may
be a placeholder; the device matrix needs a real, public one.

## 4. A public URL (device matrix only)

Real webhooks and the hosted page on a phone need the backend reachable
from outside: an SSH tunnel or an ngrok-style forwarder to `:4000`. That
URL is `PUBLIC_BASE_URL`; add the web demo's origin to
`CORS_ALLOWED_ORIGINS` for the web pass. `make sumsub-check` warns when
`PUBLIC_BASE_URL` is local.

## 5. Write the env and verify

```sh
make sumsub-env APP_TOKEN=… SECRET_KEY=… WEBHOOK_SECRET=… \
     [LEVEL_NAME=basic-kyc-level] [PUBLIC_BASE_URL=http://localhost:4000] \
     [WEBHOOK_DIGEST_ALG=HMAC_SHA256_HEX] [JWT_SECRET=…] [FORCE=1]
make sumsub-check
```

`sumsub-env` deliberately writes no `JWT_SECRET` unless given one: with
`ALLOW_INSECURE_DEV=true` the bearer token is the user id, which the live
tests and the demos send. `sumsub-check` mints a 60-second token for a
throwaway user on the level and, on refusal, says which of the three
things is wrong (401: token/secret; a 4xx naming the level: the level;
5xx: Sumsub). Then `make e2e-live` (skill `sumsub-live-verification`).

## CI

The same five names go into the `sumsub-sandbox` GitHub environment
(three secrets) and two repository variables; `E2E_LIVE=true` or the
`e2e:live` label turns the job on. `docs/operations/live-e2e-ci.md` has
the table and the rotation steps.

## Teardown

Delete the App Token when the sandbox is retired; disable the webhook if
the tunnel URL was temporary. Never commit `.env`.
