# blinkbitcoin/kyc — universal identity-verification (KYC) library, esign-shaped

## Context

Issue blinkbitcoin/blink-mobile#4246: the Level 2 Sumsub flow reports "Allow camera access" on iOS even with camera permission granted. Root causes found in the current setup:

- blink-mobile pushes a **generic** `webView` screen for KYC. It sets only `allowsInlineMediaPlayback`; no `mediaCapturePermissionGrantType`, no `onPermissionRequest`, no origin allowlist, no completion detection, and `onMessage` is fully consumed by the WebLN bridge. Info.plist has no microphone usage string.
- The hosted page lives in the private **blink-kyc** Next.js app (`/webflow` → `@sumsub/websdk-react`), coupled to Blink's GraphQL subgraph, gRPC, Postgres. It is a product backend, not a reusable library, and its event handling is `console.*` only.
- The `kycFlowStart` mutation already returns `tokenIos`/`tokenAndroid` but only `tokenWeb` is consumed. The native Sumsub SDK path was removed earlier ("chore: removing native sdk") in favour of InAppBrowser, then WebView. Each hop re-patched the same permission/media class of bugs.

Decision (user, 2026-09-05): build a **new isolated repo `blinkbitcoin/kyc`** the way `blinkbitcoin/esign` was built: provider-agnostic packages for React + React Native, a reference backend with a mock provider driving E2E, SOLID boundaries, 100% coverage, esign's CI/CD and docs. **Sumsub is the default provider**, with **native SDK as the React Native default** and a hardened hosted-WebView path as fallback. **No Blink-specific logic** in the repo. **Do not touch blink-kyc, blink-mobile, or any other blink-\* repo** in this plan; the Blink integration is a separate later effort.

Reference repo to mirror: `/Users/jonas/Dev/esign` (read `CLAUDE.md`, `packages/esign-core/src/signing/types.ts`, `apps/api/src/providers/port.ts`, `README.md` modes table, `.github/workflows/*.yml`).

## What esign gives us (copy, don't reinvent)

| esign piece | Reuse in kyc |
|---|---|
| `SigningSource { start(); interpret() }` + `isRestartable` capability check | Same seam, renamed `VerificationSource`, plus two extra capability interfaces (native launch, web mount) |
| One component per platform + local status machine | `Verification` component + headless `useVerification` hook |
| `apps/api` provider port + `mock` provider driving all E2E | `VerificationProvider` port; `mock` + `sumsub` adapters |
| Apollo-free subpath entry (`./webform`) with import-graph guard test | `./hosted` subpath |
| tsup (core/web), react-native-builder-bob (RN), Jest 100% thresholds, Vitest for api/web demo | identical |
| Biome format, ESLint flat, lefthook, commitlint scope enum, flake.nix + direnv, three-level Makefiles | identical (scopes gain `sumsub`) |
| CI: `ci.yml` → `checks.yml` / `test.yml` / `e2e.yml` (Backend, Web Playwright, Android+iOS Maestro) / badges / publish → registry smoke; `codeql.yml`, `commitlint.yml`, `cancel-closed.yml`, `release-retry.yml`; scripts under `scripts/{ci,e2e,release}` | copy verbatim, rename workspaces |
| Docs: README hero + modes table, `docs/index.md`, `docs/architecture/*`, `docs/integration/*`, mermaid `src/*.mmd` → generated `dist/*.svg` with drift check | same structure, new content |
| Release: `0.0.0-development`, `make release V=`, `next` prerelease on green main, GitHub Packages | identical |

## Architecture

### Workspaces

| Workspace | Path | Role |
|---|---|---|
| `@blinkbitcoin/kyc-core` | `packages/kyc-core/` | Platform-agnostic: `VerificationSource` seam + capability interfaces, normalized events/statuses/error codes, hosted-bridge protocol, proxy source (Apollo), Apollo client factory, codegen from `apps/api/schema.graphql`. No React/DOM/native. |
| `@blinkbitcoin/kyc-react-native` | `packages/kyc-react-native/` | `Verification` component + `useVerification` hook; `createHostedSource` (hardened `react-native-webview`); `./hosted` Apollo-free entry. |
| `@blinkbitcoin/kyc-react` | `packages/kyc-react/` | Same component/hook on web; `createHostedSource` (iframe, origin-pinned). |
| `@blinkbitcoin/kyc-sumsub` | `packages/kyc-sumsub/` | Provider adapters. Entries: `.` (shared Sumsub↔normalized mapping, pure TS), `./react-native` (wraps `@sumsub/react-native-mobilesdk-module`, optional peer), `./web` (wraps `@sumsub/websdk`, optional peer). Keeps native pods out of hosts that only use the hosted mode. |
| `backend` | `apps/api/` | Express 5 + Apollo Server 5 + Knex/Postgres. `VerificationProvider` port; `mock` and `sumsub` adapters; token issuance; webhook; hosted HTML page that embeds a provider web SDK and relays normalized events over the bridge. |
| `kyc-react-native-example` | `examples/react-native-demo/` | RN demo (Maestro target), `KYC_MODE` inlined at bundle time. |
| `kyc-react-example` | `examples/react-demo/` | Vite demo (Playwright target), `VITE_KYC_MODE`. |

### Integration modes (README table)

| Mode | What it is | App installs | Backend required |
|---|---|---|---|
| **1. Native / Web SDK** | Provider SDK runs in-process (RN native module on mobile, web SDK on web). Host supplies an access-token callback. | `kyc-react-native` (or `kyc-react`) + `kyc-sumsub` + the Sumsub SDK peer | Any backend that mints provider access tokens (or this repo's `apps/api`) |
| **2. Hosted page** | Provider web SDK on a page served by `apps/api` (or any page speaking the bridge protocol), embedded in WebView/iframe. | One package via the Apollo-free `./hosted` entry | The hosted page (this repo's `apps/api`, or your own) |
| **3. Proxy session** | Full orchestration: session creation, token refresh, webhook status sync, status query. | Package + `@apollo/client` + `graphql` | This repo's `apps/api` |

### Core contracts (`packages/kyc-core/src/verification/types.ts`)

```ts
export type VerificationStatus =
  | 'initial' | 'incomplete' | 'pending' | 'approved' | 'declined' | 'finallyRejected';

export type VerificationEvent =                       // v1 vocabulary, deliberately small
  | { type: 'applicantLoaded'; applicantId: string }
  | { type: 'submitted' }
  | { type: 'statusChanged'; status: VerificationStatus }
  | { type: 'complete'; status: VerificationStatus; applicantId?: string }
  | { type: 'cancel' }
  | { type: 'tokenExpired' }                          // hosted mode only; hook refreshes + re-injects
  | { type: 'sessionExpired' }                        // not refreshable → error state with Restart
  | { type: 'error'; code: string; message?: string };

export interface VerificationSession {
  provider: string;                 // 'sumsub' | 'mock' | ...
  sessionId?: string;               // backend session (mode 3)
  accessToken?: string;             // mode 1
  url?: string;                     // mode 2
  allowedOrigin?: string;           // postMessage origin pin (mode 2)
  applicantId?: string;
}

export interface VerificationResult { status: VerificationStatus; applicantId?: string }
export interface VerificationSourceError { code: string; message?: string }

/** Every mode: acquire a session, interpret raw messages (Open/Closed seam). */
export interface VerificationSource {
  start(): Promise<VerificationSession>;
  interpret(message: unknown): VerificationEvent | null;
}
/** Optional capabilities (Interface Segregation), detected structurally with type guards like esign's isRestartable. */
export interface TokenRefreshableSource extends VerificationSource {   // hosted mode
  refreshToken(previous: VerificationSession): Promise<string>;
}
export interface LaunchableSource extends VerificationSource {          // native SDK (RN)
  launch(session: VerificationSession, onEvent: (e: VerificationEvent) => void): Promise<VerificationResult>;
}
export const isTokenRefreshable = (s): s is TokenRefreshableSource => typeof s.refreshToken === 'function';
export const isLaunchable = (s): s is LaunchableSource => typeof s.launch === 'function';
```

`MountableSource` (web SDK mounted into a div) lives in `kyc-react` only so `HTMLElement` stays out of core, mirroring esign's `docusignWebForms.ts`. It is defined in v1 but the Sumsub web-SDK adapter that implements it is a follow-up: Sumsub's web SDK is itself an iframe, so the hosted mode already covers web.

Component rule: if `isLaunchable(source)` → launch (no WebView rendered, the resolved `VerificationResult` is the terminal `complete`); else embed `session.url` (WebView/iframe) and route `onMessage` through `source.interpret`. The component never knows a provider name.

Hosted bridge protocol (`packages/kyc-core/src/verification/bridge.ts`):
```ts
export const BRIDGE_PROTOCOL_VERSION = 1;
export interface BridgeMessage { source: 'kyc-bridge'; v: 1; type: VerificationEvent['type']; payload?: Record<string, unknown> }
export const interpretBridgeMessage = (raw: unknown): VerificationEvent | null; // rejects other sources / unsupported v
```
Page → app via `window.ReactNativeWebView.postMessage` / `window.parent.postMessage`. App → page only for token refresh: `window.__kycBridge.setToken(token)` (RN `injectJavaScript`; web `postMessage({source:'kyc-bridge', v:1, type:'setToken', token}, allowedOrigin)`). The `source` field filters Sumsub's own postMessages. The hosted page in `apps/api` emits through the same module.

Error codes: `ErrorCode` enum in `apps/api/schema.graphql` → codegen into core (`src/generated/`) + client-side codes (`NETWORK_ERROR`, `PERMISSION_DENIED`, `SDK_UNAVAILABLE`, `TOKEN_EXPIRED`, `BRIDGE_PROTOCOL`), `getErrorMessage(code)`; documented in `docs/integration/error-codes.md` like esign.

### Sumsub package (`packages/kyc-sumsub`)

- `src/mapping.ts` re-exported by `src/index.ts` (entry `.`, pure TS, no DOM/RN): `mapSumsubStatus(sdkStatus | reviewStatus, reviewResult) → VerificationStatus`, `interpretSumsubWebMessage(type, payload) → VerificationEvent | null` (covers `idCheck.onApplicantLoaded/onApplicantSubmitted/onApplicantStatusChanged/onError`), `mapSumsubMobileResult({success,status,errorType,errorMsg}) → complete|error`, `SUMSUB_EVENT_NAMES`. Single source of truth for Sumsub semantics, shared by `./react-native` and by `apps/api` (webhook mapping, and inlined into the hosted page script). Core never imports this package.
- `src/react-native.ts` (entry `./react-native`): `createSumsubNativeSource({ getAccessToken, locale?, debug?, sdk? })` → `LaunchableSource`. `start()` calls `getAccessToken()`; `launch()` runs `SNSMobileSDK.init(token, () => getAccessToken()).withHandlers({onStatusChanged,onEvent,onLog}).withLocale().build().launch()` — the SDK's own `expirationHandler` is the host callback, so no `refreshToken` on this source. `sdk` is an injected `SumsubSdkLike` for tests; default is a lazy `require('@sumsub/react-native-mobilesdk-module')` that rejects `start()` with `SDK_UNAVAILABLE` when absent. `__mocks__/@sumsub/react-native-mobilesdk-module.ts` is mapped via `moduleNameMapper` for the demo's Jest.
- `src/web.ts` (entry `./web`, **follow-up after v1**): `createSumsubWebSource` implementing `kyc-react`'s `MountableSource` over `snsWebSdk.init(token, expirationHandler)…launch(container)`. The export map reserves the subpath; v1 ships the hosted iframe path for web.
- `getAccessToken: () => Promise<string>` is the host seam (analogous to esign's `GetAuthToken`). A Blink host would later implement it from its own mutation; nothing here knows that.

### Backend (`apps/api`)

- Port `src/providers/port.ts`:
  ```ts
  interface VerificationProvider {
    createSession(userId, opts: { levelName?: string; platform: 'WEB'|'IOS'|'ANDROID'; locale?: string }): Promise<{ providerSessionId?: string; applicantId?: string; accessToken: string; expiresAt?: string }>;
    refreshToken(providerSessionId | applicantId): Promise<{ accessToken; expiresAt? }>;
    getStatus(applicantId): Promise<VerificationStatus>;
    verifyWebhook(headers, rawBody): boolean;
    parseWebhookEvent(rawBody): WebhookEvent | null;
  }
  ```
- Adapters: `src/providers/mock.ts` (deterministic; serves `/verification/mock/:sessionId` HTML that emits the bridge events on button clicks: approve / decline / cancel / token-expire / error), `src/providers/sumsub/{index,client,config}.ts` (app-token HMAC signing for `/resources/accessTokens`, webhook `X-Payload-Digest` HMAC verify, `applicantReviewed`/`applicantPending` → normalized via `@blinkbitcoin/kyc-sumsub`'s root mapping — no second mapping in the backend). Hosted page builder `src/verificationPages.ts` (template: esign `apps/api/src/signingPages.ts`) inlines the bridge emitter and `SUMSUB_EVENT_NAMES`.
- GraphQL (`src/typeDefs.ts` → `schema.graphql`): `verificationSessionStart(input: { levelName?, platform!, locale? }): VerificationSession!`, `verificationSessionRefresh(sessionId): AccessToken!`, `verificationSession(id): VerificationSessionStatus!`; `ErrorCode` enum. Auth: Bearer JWT like esign (`getAuthToken` on client).
- HTTP: `POST /graphql`, `POST /webhook/kyc/:provider`, `GET /hosted/:sessionId` (page that loads the provider web SDK with the session's token and emits bridge envelopes; `Permissions-Policy: camera=(self "https://api.sumsub.com"), microphone=(...)` header). Knex tables `verification_session`, `audit`. Fail-closed `validateSecurityConfig` (JWT secret; Sumsub app token/secret/webhook secret when `KYC_PROVIDER=sumsub`). Terminal-state machine on webhook (`approved`/`finallyRejected` never downgrade).

### Platform packages

- **RN `createHostedSource({ getSession | url, refreshToken? })`** (in `./hosted` entry) yields `session.url` + `allowedOrigin`; `interpret = interpretBridgeMessage`. The component renders the WebView with the hardened prop set encapsulated in one place (`src/hosted/webViewProps.ts`, unit-tested as a plain object): `javaScriptEnabled`, `domStorageEnabled`, `allowsInlineMediaPlayback`, `mediaPlaybackRequiresUserAction={false}`, `mediaCapturePermissionGrantType="grant"` (drives both WKWebView capture grants and Android `onPermissionRequest` in react-native-webview ≥13), `originWhitelist=[allowedOrigin]`, `onShouldStartLoadWithRequest` allowing only the session origin + provider frame origins, `setSupportMultipleWindows={false}`, `cacheEnabled={false}`, `allowFileAccess={false}`, `injectedJavaScriptBeforeContentLoaded` installing `window.__kycBridge`, `onMessage → source.interpret`. Optional `checkPermissions?: () => Promise<'granted'|'denied'|'blocked'>` prop lets hosts preflight with their own permission lib (default resolves `granted`, so the WebView prompts; no hard dep on `react-native-permissions`); `denied`/`blocked` → `permissionDenied` state with Retry and an `onOpenSettings?` callback.
- **Component `Verification`** props: `source`, `onComplete(result: VerificationResult)`, `onError(error: { code, message })`, `onCancel`, `onStatusChange?`, `label?`, `successDelayMs?`, `checkPermissions?` + `onOpenSettings?` (RN). Status machine: `idle | loading | verifying | pending | success | permissionDenied | error | offline`. `pending` is new versus esign (applicant submitted, awaiting review) and ends in `onComplete` with `status: 'pending'`.
- **Hook `useVerification(source, handlers)`** returns `{ status, session, error, start, retry }`; the component is a thin default UI over it (mirrors esign PR #60's headless hook).
- Token refresh: native SDK mode needs nothing (SDK calls `getAccessToken` itself). Hosted mode: bridge `tokenExpired` → if `isTokenRefreshable(source)` the hook awaits `refreshToken(session)` and pushes the token back into the page (`setToken`); otherwise `sessionExpired` → error state with Restart, as esign does. Guards: `mountedRef` + `refreshSeq` drop stale refreshes; refresh rejection → `TOKEN_REFRESH_FAILED` keeping the session for Restart; offline (NetInfo) → `offline` state first, refresh resumes on "Check connection"; a `launch()` that rejects for expiry gets one `start()` retry, then `TOKEN_EXPIRED`.
- Native peer deps declared like esign (`react-native-webview >=14`, `@react-native-community/netinfo >=11`, optional `@apollo/client`/`graphql`); `kyc-sumsub/react-native` has optional peer `@sumsub/react-native-mobilesdk-module`.

### Testing strategy

- Unit (Jest, 100% thresholds on all four packages; Vitest 100% on `apps/api`): core types/guards/bridge/mapping; sources with injected SDK doubles (`sdk` option) so no native module loads in Jest; component/hook via RNTL with `react-native-webview` mock in `packages/kyc-react-native/__mocks__/`; parity test that `ErrorCode` codegen matches `schema.graphql`; import-graph guard that `./hosted` never imports Apollo.
- Backend E2E (Vitest + docker Postgres tmpfs): session start/refresh/status, webhook verify + state machine, hosted page renders bridge script.
- Web E2E (Playwright, three configs: `sdk` via a stubbed `snsWebSdk` global served by the demo, `hosted`, `proxy`) driving the mock provider page.
- Mobile E2E (Maestro, Android in CI, iOS opt-in via `e2e:ios` label): `hosted` and `proxy` modes against the mock page; `fake-native` mode via `createFakeLaunchableSource()` exported from `kyc-core`'s `./testing` entry, which renders a tiny in-app "fake SDK" screen with `fake-sdk-approve` / `fake-sdk-decline` / `fake-sdk-cancel` testIDs and resolves `launch` accordingly. `KYC_MODE` is inlined at bundle time exactly like esign's `ESIGN_MODE`. The real Sumsub sandbox is a documented manual checklist (`docs/integration/sumsub.md`), not CI.

## Delivery phases (each a PR into `blinkbitcoin/kyc`, worktree per PR)

1. **Bootstrap** (`chore: scaffold repo from esign layout`): `gh repo create blinkbitcoin/kyc --public`; copy esign root tooling (package.json scripts, biome/eslint/lefthook/commitlint with `sumsub` scope, flake.nix/.envrc, Makefiles, `scripts/**`, `.github/workflows/**`, `audit-ci.jsonc`, `docs/` skeleton, `AGENTS.md`/`CLAUDE.md`/`CONTRIBUTING.md`/`SECURITY.md`/`LICENSE`); empty workspaces with passing placeholder tests so CI is green end to end (Checks → Unit → Badges → Publish `next`).
2. **`kyc-core`** (`feat(core)`): types, guards, bridge protocol, `createProxySource`, Apollo client factory, error codes/messages, operations + codegen wiring.
3. **`apps/api`** (`feat(api)`): schema, migrations, providers port + `mock` + `sumsub`, webhook, hosted page, security config, backend E2E, `docker-compose.test.yml`.
4. **`kyc-sumsub`** (`feat(sumsub)`): mapping + RN native + web adapters with injected SDK doubles; `apps/api` sumsub adapter switched to the shared mapping.
5. **`kyc-react-native`** (`feat(rn)`): hook, component, hosted source with hardened WebView, `./hosted` entry, mocks, bob build, publint/attw.
6. **`kyc-react`** (`feat(react)`): hook, component, iframe hosted source (origin-pinned `message` listener), `MountableSource` type + `isMountable`, tsup build.
7. **Demos + E2E** (`feat(demo)`, `ci(e2e)`): RN 0.86 demo with native/hosted/proxy modes + fake native source, Vite demo, Maestro + Playwright flows, badge publishing.
8. **Docs + release** (`docs`, `release`): README with hero + modes table, `docs/architecture/{mobile,web,backend,integration,api-contracts,data-models,security,source-tree}.md`, `docs/integration/{consuming,native-sdk,hosted,proxy,sumsub,error-codes}.md`, mermaid diagrams, `make release V=0.1.0`.

Explicit v1 YAGNI cuts: no `ready`/`stepCompleted` events, no `expiresAt`, no programmatic `dismiss` (Sumsub iOS has none), no Sumsub web-SDK mount adapter, one `verification_session` table plus audit (no applicant mirror), status polling query exists but the hook does not poll (webhooks are the backend truth).

Out of scope here (separate plans later): the blink-mobile integration PR (replace `useKycFlow` + generic WebView with `kyc-react-native` + `kyc-sumsub/react-native`, token from `kycFlowStart.tokenIos/tokenAndroid`), any blink-kyc change, any interim hotfix for #4246.

## Verification

- Per PR: `make test` (unit + check-code), `make coverage` (100% on packages + api), `npm run typecheck`, `npm run lint`, `npm run build && npm run check:packages`, `make check-ci`, `make docs-check`; commitlint on commits and PR title.
- Backend: `make e2e-backend`. Web: `make e2e-web`, `make e2e-web-hosted`, `make e2e-web-sdk`. Mobile: `make e2e-backend-up && make e2e-android` (and `make e2e-ios` locally / `e2e:ios` label).
- Registry smoke after publish: install `@blinkbitcoin/kyc-react-native@next` + `@blinkbitcoin/kyc-sumsub@next` into a scratch RN project and typecheck an import of each entry (`scripts/ci/registry-smoke.sh`, copied from esign).
- Manual: Sumsub sandbox run in the RN demo (native mode) on a physical iPhone and Android device with camera permission granted, denied, and first-prompt; documented checklist in `docs/integration/sumsub.md`.
