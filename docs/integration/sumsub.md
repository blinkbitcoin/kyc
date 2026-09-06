# Sumsub sandbox checklist (manual)

The Sumsub sandbox is never exercised in CI: nothing here is automated, and
nothing here needs production credentials. Run it before releasing a change
to the Sumsub adapters. ~30 minutes.

## 1. Dashboard (sandbox)

In the Sumsub dashboard, with the environment switch on **Sandbox**:

1. **Level** — create or pick a level and note its exact name; it is what
   `SUMSUB_LEVEL_NAME` (or the `levelName` argument of
   `verificationSessionStart`) must contain, character for character.
2. **App token + secret key** — Dev Space → App Tokens → generate. The secret
   is shown once.
3. **Webhook** — Dev Space → Webhooks → add a target:
   - URL: `<PUBLIC_BASE_URL>/webhook/kyc/sumsub`
   - Secret: any strong string; it becomes `SUMSUB_WEBHOOK_SECRET`
   - Digest algorithm: `HMAC_SHA256_HEX` (the backend also accepts
     `HMAC_SHA1_HEX` and `HMAC_SHA512_HEX`; anything else is rejected)
   - Subscribe at least to `applicantCreated`, `applicantPending`,
     `applicantReviewed`, `applicantOnHold`, `applicantReset`.

For a laptop backend, expose it with a tunnel and use the tunnel's URL for
both `PUBLIC_BASE_URL` and the webhook target — they must be the same origin.

## 2. Env wiring (`apps/api/.env`)

```sh
KYC_PROVIDER=sumsub
SUMSUB_APP_TOKEN=<app token>
SUMSUB_SECRET_KEY=<secret key>
SUMSUB_WEBHOOK_SECRET=<webhook secret>
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_LEVEL_NAME=<the level name from step 1>
PUBLIC_BASE_URL=https://<your tunnel or host>
JWT_SECRET=<any dev secret>
```

The server refuses to boot with a Sumsub provider and any of the three
secrets missing (`validateSecurityConfig`), so a typo fails loudly at start.

## 3. Device matrix

**React Native, native mode** (`KYC_MODE=native`, the demo in
`examples/react-native-demo`) — on a **physical iPhone** and a **physical
Android device** (the simulator/emulator has no usable camera):

| Camera permission | Expect |
|---|---|
| Granted beforehand | The SDK opens straight into the document step |
| Denied beforehand | Sumsub's own "enable camera" screen; closing it ends as a cancel, not an error |
| First prompt (never asked) | The OS dialog appears once; allowing continues the flow |

**Hosted WebView** (`KYC_MODE=hosted`, same two devices): the same three
permission states, this time answered by the WebView's own prompt.

**Web hosted iframe** (`make web`, `VITE_KYC_MODE=hosted`) in **Chrome** and
**Safari** — Safari is the one that gates `getUserMedia` differently inside a
cross-origin iframe, so it is not optional.

## 4. What to observe in each run

- The events the host receives, in order: `applicantLoaded` → `submitted` →
  `statusChanged` → `complete`, and `cancel` (never `complete`) when the user
  closes the flow before finishing.
- Backend state: `verificationSession` reports the same status the dashboard
  shows, and the webhook arrives signature-verified (`200`, no security event
  in the logs).
- Approve and decline the applicant from the dashboard and confirm the
  terminal statuses (`approved`, `finallyRejected`) are never downgraded by a
  later webhook.
- Token expiry: with `SUMSUB_TOKEN_TTL_SECS` set low (e.g. 60), leave the
  flow open past the TTL and confirm the refresh happens without a restart.

## 5. Known check that only a real run can make

The hosted page ships a strict CSP with a per-request nonce, including
`style-src 'nonce-…'`. The Sumsub web SDK is only ever loaded for real in
this manual pass, so this is where an injected style without the nonce would
first show up — watch the browser console for CSP violations, not just for
JS errors.

Phase 8 expands this page with the production-onboarding steps (applicant
sharing, level review policies, going live).
