# Sumsub sandbox - manual verification checklist

**Updated:** 2026-09-10

The unit and E2E suites run entirely against the `mock` provider, and the native-launch branch is covered by `createFakeLaunchableSource`. What can run headless against the sandbox **API** is automated (next section); everything from section 3 on needs a camera and a human, is therefore **manual**, and should be re-run before any release that touches the WebView props, the hosted page, the bridge, the Sumsub mapping or the native source.

Budget about 90 minutes for a full manual pass. Record the result of each numbered check.

## The automated tier

```bash
# Blink's sandbox, ready-made: the non-secret values are committed in
# examples/full-service-demo/.env.sumsub.example, the three secrets live in the
# team secret manager ("kyc-library sandbox (Sumsub)") - or make your own token
cp examples/full-service-demo/.env.sumsub.example examples/full-service-demo/.env  # then fill in the three secrets
# ...or write it from the values:
make sumsub-env APP_TOKEN=… SECRET_KEY=… WEBHOOK_SECRET=… LEVEL_NAME=01-upgrade-to-level-TWO [PUBLIC_BASE_URL=…]
make sumsub-check   # app-token auth + the level: mints a throwaway token, says what is wrong otherwise
make test-live      # the live tests alone (the service round trips need DATABASE_URL)
make e2e-live       # check → E2E Postgres → live tests → the access-token example mints a real token
```

For the device rows, two more one-command stacks: `make live-web` (a public URL
through Tailscale Funnel, the backend on the sandbox, the web demo - then it
waits while you run section 5 in a browser) and `make live-ios` (the same plus
Metro and the demo built onto the attached iPhone, `KYC_MODE=hosted` for
section 4, `KYC_MODE=native` for section 3). Ctrl-C tears them down.

`make e2e-live` proves, against the real sandbox: the credentials are accepted and the level exists; the access-token contract the native SDK depends on (`{ token, userId }` echoing the external user id); a user who never opened the SDK reads as `initial`; the service starts and refreshes a session on the real provider and serves its hosted page for the real token; a webhook signed with the real secret and the configured digest algorithm (`SUMSUB_WEBHOOK_DIGEST_ALG`) is accepted, binds the applicant and approves the session; and `examples/access-token-demo` mints a real token. In CI the same run is the opt-in `E2E / Live Sumsub` job ([operations/live-e2e-ci.md](../operations/live-e2e-ci.md)). The tests live in `examples/full-service-demo/tests/live/`; the repo skill `.claude/skills/sumsub-live-verification` is the runbook.

Sections 1 and 2 below are the setup the automated tier needs too (`.claude/skills/sumsub-sandbox-setup` walks them); 2.1, 2.4 and 2.5 are what the unit and E2E suites already cover.

## 0. Prerequisites

- A Sumsub **sandbox** account (never production credentials).
- A physical iPhone and a physical Android device. Simulators and emulators have no real camera and cannot exercise the liveness step - the one class of bug this checklist exists to catch.
- Chrome and Safari on a desktop, for the web pass.
- A publicly reachable URL for the backend, so Sumsub can deliver webhooks (`tailscale funnel --bg 5100` on a machine with Tailscale, else an SSH tunnel or an ngrok-style forwarder). Note it as `PUBLIC_BASE_URL`. A phone finds the backend through `KYC_API_HOST` at Metro start (`examples/react-native-demo/README.md`).

## 1. Sumsub dashboard setup

| # | Step | What to record |
|---|------|----------------|
| 1.1 | Create or pick a **verification level** in the sandbox. The default this repo assumes is `basic-kyc-level` | The exact level name |
| 1.2 | Confirm the level includes an identity document **and** a liveness/selfie step - a document-only level never opens the camera and will make every check below pass vacuously | Steps enabled |
| 1.3 | Create an **App Token** (Dev space → App Tokens). Copy the token and the secret key - the secret is shown once | `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` |
| 1.4 | Add a **webhook**: URL `<PUBLIC_BASE_URL>/webhook/kyc/sumsub`, method POST | The URL as registered |
| 1.5 | Subscribe the webhook to at least `applicantReviewed`, `applicantPending`, `applicantCreated`, `applicantOnHold` and `applicantReset` | Which types are enabled |
| 1.6 | Copy the webhook **secret key** and note the **digest algorithm**. The backend supports `HMAC_SHA1_HEX`, `HMAC_SHA256_HEX` and `HMAC_SHA512_HEX` and reads the choice from the `x-payload-digest-alg` header, defaulting to SHA-256 | `SUMSUB_WEBHOOK_SECRET`, algorithm |

## 2. Backend configuration

```env
KYC_PROVIDER=sumsub
SUMSUB_APP_TOKEN=<1.3>
SUMSUB_SECRET_KEY=<1.3>
SUMSUB_WEBHOOK_SECRET=<1.6>
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_LEVEL_NAME=<1.1>
SUMSUB_TOKEN_TTL_SECS=600
JWT_SECRET=<any value for the sandbox>
PUBLIC_BASE_URL=<your public https base>
DATABASE_URL=postgresql://dev:dev@localhost:5432/kyc
CORS_ALLOWED_ORIGINS=<your web demo origin>
```

| # | Check | Expected |
|---|-------|----------|
| 2.1 | Start the backend with one of the three `SUMSUB_*` secrets removed | It **refuses to boot** and names the missing variable |
| 2.2 | Restore it and start again | Boot log shows `Verification provider: sumsub` |
| 2.3 | `curl <PUBLIC_BASE_URL>/health` from outside your network | `{"status":"ok",…}` - if this fails, webhooks will fail too |
| 2.4 | `POST <PUBLIC_BASE_URL>/webhook/kyc/mock` with any body | `404 Unknown provider` - a mock payload must never reach a Sumsub deployment |
| 2.5 | `POST <PUBLIC_BASE_URL>/webhook/kyc/sumsub` with a body and no signature header | `401 Unauthorized` |

## 3. React Native, native SDK mode (`KYC_MODE=native`)

The demo deliberately does not install `@sumsub/react-native-mobilesdk-module`. Install it in the demo (and run `pod install`) for this pass, and remove it again afterwards.

```bash
cd examples/react-native-demo
npm i @sumsub/react-native-mobilesdk-module
(cd ios && bundle exec pod install)
cd ../.. && KYC_MODE=native make live-ios      # backend + Metro + the app on the attached iPhone
```

Run every row on **both** an iPhone and an Android device.

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 3.1 | **First prompt** | Fresh install, camera permission never asked. Tap `verification-start-button` | The SDK opens and the OS prompts for the camera. Granting proceeds to document capture. The app never shows an "Allow camera access" screen of its own |
| 3.2 | **Already granted** | Permission granted beforehand. Start | The SDK opens straight into capture, no prompt, no dead screen |
| 3.3 | **Denied at the prompt** | Fresh install, deny the OS prompt | The SDK reports the denial. The demo's outcome line shows an error, not a hang. With a `checkPermissions` preflight wired, the `permission-screen` appears instead and `onError` is **not** called |
| 3.4 | **Permanently blocked** | Deny twice on iOS / choose "Don't ask again" on Android, then start | The `permission-screen` appears with **Open settings**; the button opens the OS settings page for the app |
| 3.5 | **Full happy path** | Submit a sandbox document plus liveness | Outcome line reads `completed: pending` (or `approved` if the level auto-approves). `verification_session.status` moves off `initial` |
| 3.6 | **Approval webhook** | Approve the applicant in the dashboard | Within seconds the backend logs the webhook and the row reads `approved`. An `AuditLog` row exists with `action: status_updated`, `source: webhook` |
| 3.7 | **Retryable rejection** | Reject with a retry reason | Row reads `declined`; a further approval is still accepted |
| 3.8 | **Final rejection** | Reject finally, then send an approval | Row reads `finallyRejected` and the later approval is answered `200` with outcome `rejected_terminal` and an audit entry - **the status must not change** |
| 3.9 | **Token expiry** | Set `SUMSUB_TOKEN_TTL_SECS=60`, start, and idle past the TTL | The SDK calls the expiration handler and the flow continues without a visible error |
| 3.10 | **Cancel** | Start, then dismiss the SDK | Outcome line reads `cancelled`; the screen returns to idle with the start button visible |
| 3.11 | **SDK absent** | Uninstall the peer, rebuild, start | The error screen shows the `SDK_UNAVAILABLE` copy - no native crash |
| 3.12 | **Concurrent launch** | While the SDK screen is open, trigger a second `launch()` from your own code (not reachable from the shipped demo UI) | The second call is rejected outright rather than racing the first over the same screen |

## 4. React Native, hosted WebView mode (`KYC_MODE=hosted`)

```bash
make live-ios                                  # KYC_MODE=hosted is the default
```

Same device matrix.

| # | Scenario | Expected |
|---|----------|----------|
| 4.1 | **First prompt** | The WebView itself prompts for the camera. Granting proceeds - this is the case `mediaCapturePermissionGrantType: 'grant'` exists for, and the historical failure mode is a permission-granted device still showing "Allow camera access" inside the page |
| 4.2 | **Already granted** | Camera opens immediately, inline, not fullscreen |
| 4.3 | **Denied** | The page reports the failure; the flow reaches the error screen with a retry, never a blank frame |
| 4.4 | **Blocked** | Same, and re-granting in OS settings then **Try again** recovers without reinstalling |
| 4.5 | **Happy path** | `pending-screen` or `success-screen`, and the outcome line matches |
| 4.6 | **Token refresh** | With a short TTL, the page emits `tokenExpired`, the app injects a new token, and the flow continues on the `pending-screen` - no Restart prompt |
| 4.7 | **Non-refreshable source** | Build the source without `refreshToken`; on expiry the error screen offers **Restart**, and Restart starts a clean session |
| 4.8 | **Navigation containment** | Follow any external link inside the page | Navigation is blocked - only the session origin and declared provider origins load |
| 4.9 | **Backgrounding** | Send the app to the background mid-liveness and return | The page resumes or fails with a coded error; no frozen camera surface |

## 5. Web, hosted iframe mode (`VITE_KYC_MODE=hosted`)

```bash
make live-web                                  # then open http://localhost:5101
```

Run in **Chrome and Safari**, over HTTPS (or `localhost`).

| # | Scenario | Expected |
|---|----------|----------|
| 5.1 | **First prompt** | The browser prompts for the camera *for the embedded page's origin*. Granting proceeds |
| 5.2 | **Denied** | The page reports `PERMISSION_DENIED` and the component shows the `permission-screen` - and does **not** call `onError` |
| 5.3 | **Happy path** | `success-screen` / `pending-screen` and the matching outcome line |
| 5.4 | **Origin pin** | In the console, `window.postMessage({source:'kyc-bridge',v:1,type:'complete',payload:{status:'approved'}}, '*')` from the top document | **Nothing happens** - the message is not from the frame's `contentWindow` |
| 5.5 | **Token refresh** | With a short TTL, the refresh envelope reaches the page and the flow continues |
| 5.6 | **CSP** | The browser console shows no CSP violation from the hosted page |
| 5.7 | **Safari specifically** | Camera works with the sandboxed iframe - Safari is the strictest of the two about `allow` plus sandbox interaction |

## 6. Teardown

| # | Step |
|---|------|
| 6.1 | Remove `@sumsub/react-native-mobilesdk-module` from the demo again and restore `package-lock.json` (`git checkout -- examples/react-native-demo/package.json package-lock.json`) |
| 6.2 | Delete or disable the sandbox webhook if the tunnel URL was temporary |
| 6.3 | Never commit the credentials. `examples/full-service-demo/.env` is gitignored - keep them there or in a secret manager |

## Recording the result

What earlier passes taught, and their fixes: [sumsub-lessons.md](sumsub-lessons.md).

Note, per release: the date, the app versions, the two device models and OS versions, the browsers, the level name, and any row that did not behave as described. A failing row is a release blocker for the mode it belongs to, not a known issue.
