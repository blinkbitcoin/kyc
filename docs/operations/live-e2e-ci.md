# Live Sumsub E2E in CI

For whoever operates the repository's GitHub settings. The live job runs
the same thing a developer runs with `make e2e-live`, against the real
Sumsub **sandbox**: the app-token auth, a real access token minted through
the package, through the service (start, refresh, status, the hosted page)
and through the access-token example, and a webhook signed with the real
webhook secret walking a session to `approved`. It is opt-in, because every
run mints tokens on the sandbox and needs credentials that fork PRs must
never see. CI never drives the Sumsub UI: the device matrix in
[sumsub.md](../integration/sumsub.md) stays manual.

## What to set up, once

| Where | Name | Value |
|---|---|---|
| Environment `sumsub-sandbox`, secret | `SUMSUB_APP_TOKEN` | a sandbox App Token (Dev space → App Tokens) |
| Environment `sumsub-sandbox`, secret | `SUMSUB_SECRET_KEY` | that token's secret key (shown once) |
| Environment `sumsub-sandbox`, secret | `SUMSUB_WEBHOOK_SECRET` | the webhook secret key; the live test signs its own webhook with it |
| Repository variable | `SUMSUB_LEVEL_NAME` | the sandbox level with a document and a liveness step (default `basic-kyc-level`) |
| Repository variable | `SUMSUB_WEBHOOK_DIGEST_ALG` | the digest algorithm registered on the webhook: `HMAC_SHA256_HEX` (default), `HMAC_SHA1_HEX` or `HMAC_SHA512_HEX` |
| Repository variable | `E2E_LIVE` | `true` to run on every main push, release and dispatch; unset or anything else = off |

1. **Create the environment** `sumsub-sandbox` (Settings → Environments).
   Add required reviewers if a human should approve each live run; leave it
   open for unattended runs.
2. **Create a CI App Token** in the Sumsub sandbox, separate from any
   developer's (Dev space → App Tokens). The click path is in
   [sumsub.md](../integration/sumsub.md), section 1, and the repo skill
   `.claude/skills/sumsub-sandbox-setup`.
3. **Register a webhook** with a secret key (the URL can point anywhere
   reachable, or at a placeholder: the automated tier never waits for a
   webhook from Sumsub, it signs its own with that secret). Note the digest
   algorithm.
4. **Add the secrets and variables** from the table.
5. **Turn it on**: `E2E_LIVE=true`, or label a PR `e2e:live` for one run.

## When it runs

- `E2E_LIVE=true`: on every push to `main`, every release run and every
  manual dispatch of `ci.yml`, as the `E2E / Live Sumsub` job.
- PR label `e2e:live`: for that PR, only when its head branch lives in this
  repository. Fork PRs receive no secrets, so the label has no effect there.
- Runs are serialized (`concurrency: live-sumsub`); one takes about a
  minute. Each run mints a handful of 60-second and 10-minute access tokens
  for throwaway external user ids and creates no applicant; nothing to
  clean up on the Sumsub side.

## What you get

- A green job means: the credentials are accepted, the level exists, the
  access-token contract the native SDK and the access-token example depend
  on holds (`{ token, userId }` echoing the external user id), a user with
  no applicant reads as `initial`, the service starts and refreshes a
  session on the real provider and serves its hosted page for the real
  token, and a webhook signed with the real secret and the configured
  digest algorithm is accepted, binds the applicant and approves the
  session. The job starts the E2E Postgres (Docker) for the service round
  trips, like the Backend job does.
- Nothing is uploaded: the service log would carry live access tokens.

## Rotation and revocation

- **Rotation**: create a new App Token in the sandbox, update the two
  secrets, delete the old token in Sumsub. For the webhook secret: change
  it on the webhook, update `SUMSUB_WEBHOOK_SECRET`.
- **Revocation**: delete the App Token in Sumsub; the secrets become
  useless immediately. Nothing else references them.

## Failure modes

| Job output | Meaning | Fix |
|---|---|---|
| `sumsub check: missing SUMSUB_…` | the job ran without the environment's secrets (wrong environment name, or a fork PR) | check the environment name and the trigger |
| `HTTP 401 … not accepted` | wrong App Token or secret key, or the token was revoked | step 2, then the secrets |
| `HTTP 4xx … SUMSUB_LEVEL_NAME` | the level does not exist in this sandbox | `SUMSUB_LEVEL_NAME` |
| the signed-webhook test answers `401` | `SUMSUB_WEBHOOK_DIGEST_ALG` does not match what the test signs with, or the secret differs | the two variables/secrets |
| `server demos smoke: access-token mutation (sumsub)` fails | the example could not mint: same credentials, so the check above normally fails first | read the example's log line in the job |

Everything above maps one to one onto the local run, which is the place to
debug: `make sumsub-check`, `make test-live`, `make e2e-live`, and the repo
skill `.claude/skills/sumsub-live-verification`.
