# Sumsub - lessons from the live passes

What real Sumsub taught this repo that the mock provider could not. One
section per pass, newest first; the automated tier is `make e2e-live`
(`docs/integration/sumsub.md`, "The automated tier"), the device rows are
sections 3-5 of that checklist.

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
