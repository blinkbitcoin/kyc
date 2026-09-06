# Integration Architecture

**Project:** blinkbitcoin/kyc monorepo (npm workspaces)
**Updated:** 2026-09-06

## Parts

| Part | Root | Type | Role |
|------|------|------|------|
| `core` | `packages/kyc-core/` | Publishable TS package | The vocabulary: `VerificationSource`, the capability guards, the `kyc-bridge` protocol, the shared state machine, the error-code contract, the proxy source |
| `sumsub` | `packages/kyc-sumsub/` | Publishable TS package | The only place that knows Sumsub: status/event mapping plus the React Native native-SDK source |
| `react-native` | `packages/kyc-react-native/` | Publishable RN library | The product on mobile: `Verification` + `useVerification` over a hardened WebView |
| `react` | `packages/kyc-react/` | Publishable web library | The product on the web: the same pair over an origin-pinned iframe |
| `backend` | `apps/api/` | Express 5 + Apollo Server 5 | The reference service: session issuance, token refresh, provider webhooks, the hosted page |
| `demos` | `examples/react-native-demo/`, `examples/react-demo/` | Host apps | Executable integration docs and the Maestro / Playwright E2E targets |

[![System Architecture](../diagrams/dist/system-architecture.svg)](../diagrams/src/system-architecture.mmd)

## Integration Points

### 1. Host app → package: one component, one source

- **From:** the host's own screen
- **To:** `Verification` (`packages/kyc-react-native/src/Verification.tsx`, `packages/kyc-react/src/Verification.tsx`)
- **Contract:** `source`, `onComplete`, `onError`, `onCancel`, plus optional `onStatusChange`, `label`, `successDelayMs`, `style`
- **Invariant:** the component never learns a provider name. Which mode runs is decided entirely by the `VerificationSource` the host passes in, detected structurally: `isLaunchable(source)` → run `launch()` with no embed; otherwise (web only) `isMountable(source)` → hand it a `<div>`; otherwise embed `session.url`.
- The embedding primitive is mounted once and kept mounted across `verifying` → `pending`, rather than unmounted: on React Native it is hidden with `pointerEvents="none"` plus `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`; on the web with `hidden` + `inert` + `aria-hidden` (kept in the layout at zero size so the bridge stays alive). A cancel affordance stays available while a hosted session is `verifying`, using the same `verification-cancel-button` testID as the idle screen.

### 2. Package → package: `@blinkbitcoin/kyc-core` is the only shared vocabulary

- **From:** `kyc-react-native`, `kyc-react`, `kyc-sumsub`
- **To:** `@blinkbitcoin/kyc-core` (a hard `dependency` of all three, pinned to the exact same version at publish time)
- **Shared:** `VerificationStatus`, `VerificationEvent`, `VerificationSession`, `VerificationResult`, `VerificationSource` and its two capability sub-interfaces, `isTokenRefreshable` / `isLaunchable`, the bridge module, `ErrorCodes` / `ClientErrorCodes` / `getErrorMessage`, and the state machine (`machineReducer`, `planEvent`, `describeOutcome`, `isRestartableError`).
- **Why the machine lives in core:** it is pure TypeScript over core's own vocabulary - no React, no React Native, no DOM, no Apollo - and both platform packages need byte-identical semantics for the eight states, the outcome copy and the Restart affordance. A copy per platform would create two sources of truth for the one thing they must never disagree about.
- **Where the two platforms genuinely diverge:** the web hook intercepts a bridge `error` event carrying `PERMISSION_DENIED` into `permissionDenied` *before* the shared planner runs (`onError` is not called); React Native has no such interception; a denied `checkPermissions()` preflight is what drives `permissionDenied` there instead. This is a documented, deliberate divergence, not drift - see [mobile.md](mobile.md) and [web.md](web.md).

### 3. Package → backend: GraphQL over HTTP (proxy mode only)

- **From:** `createProxySource` (`packages/kyc-core/src/verification/proxySource.ts`) over an Apollo Client from `createKycApolloClient`
- **To:** `POST /graphql`
- **Operations:** `verificationSessionStart`, `verificationSessionRefresh`, `verificationSession`
- **Auth:** `Authorization: Bearer <token>` from the host's `getAuthToken` callback
- **Containment:** this is the *only* module in the repo that imports Apollo. It is exported from core's `.` entry and deliberately absent from `./hosted`, which is what makes `@blinkbitcoin/kyc-react-native/hosted` installable without `@apollo/client` or `graphql`. A guard test (`src/__tests__/hosted-entry.test.ts`) and `scripts/pack-smoke.sh` both prove it on every run.

### 4. Hosted page ↔ embedding primitive: the `kyc-bridge` protocol

- **From:** the page served by `GET /hosted/:sessionId` (or any page speaking the protocol)
- **To:** `HostedWebView` (`onMessage`) or `HostedFrame` (a `message` listener)
- **Page → app:** `{ source: 'kyc-bridge', v: 1, type, payload? }`, posted through `window.ReactNativeWebView.postMessage(JSON.stringify(msg))` when present, else `window.parent.postMessage(msg, '*')`. `interpretBridgeMessage` accepts an object **or** a JSON string and returns `null` for anything whose `source` or `v` does not match.
- **App → page:** two transports, deliberately different. React Native injects `createSetTokenScript(token)`, which calls `window.__kycBridge.setToken("<bare token>")` - there is no envelope to check because the injected script is trusted. The web posts `createSetTokenMessage(token)`, the full `{ source, v, type: 'setToken', token }` envelope, at the pinned origin - never at `'*'`. The page's `readToken` accepts both shapes.
- **Origin pinning is the client's job:** the page posts with target origin `'*'` and does not check who embeds it (a deliberate tradeoff, paired with the hosted page's own `frame-ancestors *` - see [security.md](security.md)). `HostedFrame` accepts a message only when `event.origin === session.allowedOrigin` **and** `event.source === iframe.contentWindow`; `HostedWebView` pins through `originWhitelist = [origin, ...allowedNavigationOrigins]` plus the `onShouldStartLoadWithRequest` navigation guard. react-native-webview checks `originWhitelist` first and opens a miss in the system browser rather than handing it to the guard; the guard itself runs for every navigation action, main frame and subframes alike, and on Android an unanswered guard is allowed through after 250 ms (defense in depth, not a sandbox).

### 5. Provider → backend: signed webhook callbacks

- **From:** Sumsub (`applicantReviewed`, `applicantCreated`, `applicantPending`, `applicantOnHold`, `applicantReset`) or the mock page's own signed POSTs
- **To:** `POST /webhook/kyc/:provider`
- **Verified with:** `x-payload-digest` + `x-payload-digest-alg` (Sumsub) or `X-Mock-Signature` (mock), both hex HMAC over the raw body, compared in constant time
- **Effect:** `handleWebhookEvent` maps the payload to a normalized `VerificationStatus` and applies it under a terminal-state guard - `approved` and `finallyRejected` never downgrade.

### 6. Backend → Sumsub REST

- **From:** `apps/api/src/providers/sumsub/client.ts`
- **To:** `POST /resources/accessTokens`, `GET /resources/applicants/<id>/status`, `GET /resources/applicants/-;externalUserId=<id>/one`
- **Auth:** app-token signing - `X-App-Token`, `X-App-Access-Ts`, `X-App-Access-Sig` (hex HMAC-SHA256 over `<ts><METHOD><path+query><body>`)
- **Resilience:** `withRetry` (3 attempts, 500 ms base) retries transport failures and 5xx/429 responses, never other 4xx.

### 7. Backend → PostgreSQL

- **From:** `apps/api/src/{session,audit,webhook}.ts` over Knex
- **To:** `VerificationSession` and `AuditLog` (see [data-models.md](data-models.md))
- **Transactional pairs:** row-write + audit-write always share one transaction, both on creation and on webhook-driven status changes.

## The shared error-code contract

`enum ErrorCode` in `apps/api/schema.graphql` is the wire contract. `make codegen` emits it into `packages/kyc-core/src/generated/error-code.ts`, a parity test fails on drift, and the platform packages surface it unchanged through `onError({ code, message })`. Client-only failures use a second, non-schema set (`ClientErrorCodes`). Both are tabulated for consumers in [../integration/error-codes.md](../integration/error-codes.md).

## E2E integration testing

| Suite | Runner | What it actually integrates |
|-------|--------|-----------------------------|
| Backend | Vitest + dockerized Postgres on 5433 | Resolvers, migrations, the signed webhook and the hosted page HTML, end to end |
| Web | Playwright (`make e2e-web`, `make e2e-web-proxy`) | The real cross-origin iframe (app on 5173/5174, page on 4000), so the `postMessage` path and the origin pin are genuinely exercised |
| Mobile | Maestro (`make e2e-android`, `make e2e-ios`, `make e2e-fake-native`) | The real WebView, the bridge, and - via `createFakeLaunchableSource` - the native-launch branch without any provider SDK. CI's Metro starts with `KYC_MODE=hosted` (`scripts/e2e/metro-start.sh`); `e2e-fake-native` is manual, Android-emulator-only, and needs its own `KYC_MODE=fake-native` Metro |

The real Sumsub sandbox is deliberately **not** in CI: it is a manual checklist, [../integration/sumsub.md](../integration/sumsub.md).

## Shared dependencies

`@blinkbitcoin/kyc-core` (all three packages), `graphql` pinned to 16.x, `@apollo/client` 4 as an optional peer, TypeScript 6, and a single root `package-lock.json` for every workspace.
