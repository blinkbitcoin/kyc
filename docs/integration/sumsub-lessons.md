# Sumsub - lessons from the live passes

What real Sumsub taught this repo that the mock provider could not. One
section per pass, newest first; the automated tier is `make e2e-live`
(`docs/integration/sumsub.md`, "The automated tier"), the device rows are
sections 3-5 of that checklist.

## 2026-09-10 - second pass, the real-submission tier (step 0 with the local token)

**Setup:** the same sandbox and token as the first pass, level
`01-upgrade-to-level-TWO`; a throwaway script running the six sandbox calls
the submission tests use (create applicant, upload the German passport
template, steps status, request check, simulate the review, status).

**Result:** stopped at the first call. `POST /resources/applicants?levelName=…`
answers `403 {"description":"User not authorized."}` in 142 ms with the
`kyc-library-local (jonas)` token: the dashboard user that generated it
could not grant *Create applicants*, so the token does not have it. The
submission tests (`tests/live/sumsub-submission.live.test.ts`) are written
against Sumsub's documented contract and wait for a token with that
permission (an admin generates it; `.claude/skills/sumsub-sandbox-setup`,
step 2) and for a document-only level (`SUMSUB_E2E_LEVEL_NAME`,
`kyc-library-e2e`) so `status/pending` is not refused for the missing
liveness image. Open questions for the next pass: how long the sandbox
takes from `testCompleted` to `completed` (the poll budget is 90 s), and
whether the real `applicantReviewed` webhook reaches the funnel before the
reconciling read (the test logs `approved:webhook` / `approved:api`).

**What it taught:**

- **Sumsub template images are recognised by their bytes.** The German
  passport template is committed unmodified with its SHA-256 in
  `tests/live/fixtures/sumsub/README.md`; a re-saved copy would be reviewed
  as an ordinary photo.
- **The request signature covers the body bytes.** `signPayload` now takes
  `string | Uint8Array`, because a multipart upload cannot be signed as a
  UTF-8 string.

## 2026-09-10 - first pass, Blink's sandbox, automated tier + section 2

**Setup:** Blink's Sumsub sandbox (`blinkbtc.com`), a dedicated App Token
`kyc-library-local (jonas)` with the dashboard's default permissions (the
"Create applicants" permission was not grantable to that dashboard user and
turned out not to be needed for minting SDK access tokens), level
`01-upgrade-to-level-TWO` (ID document + liveness + geolocation), a
dedicated webhook `kyc-library-local (jonas)` on SHA256 pointing at a
Tailscale Funnel (`tailscale funnel --bg 5100`) in front of the backend.
macOS 26, Node 24.

**Result:** `make sumsub-check` ok; `make e2e-live` green after one fix:
the four live tests (token contract, `initial` for a user with no
applicant, service start/refresh/status/hosted page, a self-signed webhook
binding and approving a session) and the access-token example minting a
real token. Section 2 of the checklist: 2.1 the service refuses to boot
naming the missing secret, 2.2 boots on `sumsub`, 2.3 `/health` answers
from the internet, 2.4 the mock route 404s, 2.5 an unsigned Sumsub webhook
401s - all through the funnel.

**What it taught:**

- **Level names are per account, never a repo constant.** The access-token
  example minted on its hard-coded `basic-kyc-level`, which no real account
  has; Sumsub answers a 4xx that the provider maps to
  `SESSION_CREATION_FAILED`. The example's tier table now reads
  `KYC_LEVEL_BASIC` / `KYC_LEVEL_ENHANCED`, and `make e2e-live` mints on
  `SUMSUB_LEVEL_NAME`.
- **A sandbox access token is ~156 characters** and the mint echoes the
  external user id; `fetchApplicantByExternalUserId` for a user who never
  opened the SDK is a real 404, which is what `getStatusByUserId` turns into
  `initial`. Both contracts the code relied on hold.
- **The dashboard defaults to Production** after login even for a sandbox
  account; the environment toggle in the header must say Sandbox before
  creating anything (the sandbox banner confirms it). An App Token cannot be
  edited after creation.
- **Tailscale Funnel works as the public URL**: the first HTTPS request
  waits ~20 s while the certificate is issued (looks like a hang), after
  that `/health` answers from outside. `tailscale funnel --https=443 off`
  stops it.
- **The webhook secret is yours to set** (the form pre-fills a random one):
  generating it locally and pasting it into the form avoids transcribing a
  secret out of the browser.

**Not run in this pass:** the device rows (sections 3-5) - see the next
pass; the Android rows wait for a physical Android device (the emulator's
virtual camera cannot do liveness).
