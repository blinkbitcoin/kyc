# Architecture - Mobile (`@blinkbitcoin/kyc-react-native`)

**Part:** react-native
**Type:** Publishable React Native library (react-native-builder-bob)
**Updated:** 2026-09-10

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Language | TypeScript | 6.0.x |
| UI | React / React Native | 19.x / 0.83+ |
| Embedding | react-native-webview | 14+ (peer) |
| Connectivity | @react-native-community/netinfo | 11+ (peer) |
| Build | react-native-builder-bob | 0.43.x |
| Testing | Jest | 30.x, 100% thresholds |

## Package structure

| Path | Role |
|------|------|
| `src/IdentityVerification.tsx` | The default UI: one screen per machine state, nothing else |
| `src/useIdentityVerification.ts` | The headless flow: permissions → connectivity → `start()` → launch or embed → the message pump |
| `src/useTokenRefresh.ts` | Hosted-mode token push, behind mount and sequence guards |
| `src/hosted/webViewProps.ts` | The hardened WebView attribute set **as data**, plus `originOf`, `matchesOrigin`, `createNavigationGuard`, `BRIDGE_STUB_SCRIPT` |
| `src/hosted/HostedWebView.tsx` | The thin component that applies them |
| `src/theme.ts` | The base `StyleSheet`, `DEFAULT_LABELS`, `resolveStyles` / `resolveLabels` (base < `theme` < `styles`; default < `label` < `labels`) |
| `src/providers/sumsub/{sdk,source,entry}.ts` | `createSumsubNativeSource` over the optional Mobile SDK peer, and the `./sumsub` surface |
| `src/types.ts` | Type-only barrel (`IdentityVerificationProps`, `IdentityVerificationStyles`, the platform's `IdentityVerificationLabels`) |
| `src/index.ts` / `src/hosted.ts` / `src/sumsub.ts` | The `.`, `./hosted` and `./sumsub` entries |

## Entry points

| Import | Contents | Needs Apollo? |
|--------|----------|---------------|
| `@blinkbitcoin/kyc-react-native` | Everything, plus core's root (`createProxySource`, the Apollo client factory) | Yes (optional peers) |
| `@blinkbitcoin/kyc-react-native/hosted` | The component, the hook, the WebView primitives, the theme resolvers, plus `@blinkbitcoin/kyc-core/hosted` | **No** (guard-tested, pack-smoked) |
| `@blinkbitcoin/kyc-react-native/sumsub` | The `/hosted` surface plus `createSumsubNativeSource` and core's Sumsub mapping | **No** (guard-tested); the SDK peer is optional and required lazily |

Metro resolves the `react-native` export condition straight to `./src/*.ts`, so a hosted-only app never installs `@apollo/client` or `graphql`; the guard test walks each entry's import graph into core's source.

## State machine

The machine is not owned here - it lives in `@blinkbitcoin/kyc-core` (`src/verification/machine.ts`) and is shared byte-for-byte with the web package.

[![IdentityVerification Flow Process](../diagrams/dist/verification-flow.svg)](../diagrams/src/verification-flow.mmd)

| State | Meaning | Entered from | Callback |
|-------|---------|--------------|----------|
| `idle` | nothing running | initial, a `cancel` event, `cancel()` | `onCancel` on cancel |
| `loading` | permissions → connectivity → `source.start()` in flight | `start()` / `retry()` / `restart()` | - |
| `verifying` | session acquired: WebView on screen, or `launch()` running | session resolved | - |
| `pending` | applicant submitted, or a terminal non-approved outcome | `submitted`, `statusChanged: pending`, `complete` with any non-`approved` status | `onStatusChange`, then `onComplete` when terminal |
| `success` | `complete` with `approved` | `complete: approved` | `onComplete` after `successDelayMs` |
| `permissionDenied` | `checkPermissions()` returned `denied` or `blocked` | the preflight | **none** |
| `offline` | NetInfo reports disconnected or unreachable | the preflight | **none** |
| `error` | `start()` rejected, an `error` / `sessionExpired` event, a failed refresh, a WebView load failure | any | `onError` |

`planEvent(event, session)` maps each normalized event to `{ action, effect }`: `applicantLoaded` → record the applicant; `submitted` → `awaitReview` plus a `statusChange: 'pending'`; `statusChanged` → `awaitReview` only for `pending`; `complete` → the terminal outcome, delayed only when `approved`; `cancel` → `idle`; `tokenExpired` → a `refreshToken` effect with no state change; `sessionExpired` → `error` with `TOKEN_EXPIRED` and the session kept; `error` → `error` with the code as sent. There is no `isCheckingConnection` state or action anywhere in the machine - connectivity is checked once, synchronously, inside `begin()`.

`describeOutcome(status)` is the outcome-screen copy; `isRestartableError(code)` is true only for `TOKEN_EXPIRED` and `TOKEN_REFRESH_FAILED`, and decides whether the error screen offers **Restart** (which drops the session) or **Try again**.

## `<IdentityVerification />` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `VerificationSource` | - | The mode |
| `onComplete` | `(result: IdentityVerificationResult) => void` | - | Terminal outcome, including `pending`, `declined` and `finallyRejected` |
| `onError` | `(error: IdentityVerificationError) => void` | - | Failures only - never offline or permission-denied |
| `onCancel` | `() => void` | - | The user aborted |
| `onStatusChange` | `(status: IdentityVerificationStatus) => void` | - | Every intermediate status |
| `label` | `string` | `'Verify identity'` | Idle title and button (`DEFAULT_LABEL`) |
| `theme` | `IdentityVerificationTheme` | - | Colors and font for the built-in screens (`src/theme.ts` resolves base < theme < `styles`) |
| `styles` | `IdentityVerificationStyles` | - | Per-element overrides by `IdentityVerificationStyleKey` |
| `labels` | `IdentityVerificationLabels` | - | Every string the screens render, resolved by core's `resolveLabelsWith` over `DEFAULT_LABELS` |
| `successDelayMs` | `number` | `1500` | Success screen before `onComplete` (approvals only) |
| `checkPermissions` | `() => Promise<'granted' \| 'denied' \| 'blocked'>` | - | Optional preflight - the host's own permission library |
| `onOpenSettings` | `() => void` | - | Renders `open-settings-button` on the permission screen, only when `permissionReason === 'blocked'` |
| `allowedNavigationOrigins` | `string[]` | `[]` | Extra origins the WebView may navigate to (provider frames) |
| `renderLoading` | `() => ReactElement` | - | Replaces the default spinner |
| `style` | `StyleProp<ViewStyle>` | - | Applied to every screen and to the WebView |

Stable testIDs: `verification-start-button`, `verification-cancel-button` (idle screen, and the cancel affordance shown while a hosted session is `verifying`), `loading-indicator`, `verification-webview`, `launch-screen`, `pending-screen`, `pending-message`, `success-screen`, `permission-screen`, `open-settings-button`, `offline-screen`, `check-connection-button`, `error-screen`, `error-message`, `retry-button`, `restart-button`.

## The hardened WebView

`createHostedWebViewProps` returns a plain object, unit-tested as data so the hardening cannot regress silently:

| Prop | Value | Why |
|------|-------|-----|
| `javaScriptEnabled` / `domStorageEnabled` | `true` | The provider SDK needs both |
| `allowsInlineMediaPlayback` | `true` | iOS liveness must not go fullscreen |
| `mediaPlaybackRequiresUserAction` | `false` | The SDK starts the camera itself |
| `mediaCapturePermissionGrantType` | `'grant'` | **iOS/macOS only**: grants WKWebView capture without a second in-page prompt - the single fix for "Allow camera access" loops. Android has no equivalent property; `react-native-webview`'s own `onPermissionRequest` grants camera/mic to whatever origin asks, as long as the app itself already holds the OS permission |
| `originWhitelist` | `[origin, ...allowedNavigationOrigins]`, else `['https://*']` | react-native-webview checks this list **first**, for every navigation; a URL that misses it is never offered to the guard below - it is opened in the system browser instead |
| `onShouldStartLoadWithRequest` | `createNavigationGuard([origin, ...allowedNavigationOrigins])` | Re-checked for every navigation the platform reports, main frame and subframes alike, after the whitelist already accepted the URL. Defense in depth, not a sandbox: on Android an unanswered guard is allowed through after 250 ms |
| `setSupportMultipleWindows` | `false` | No popups |
| `cacheEnabled` / `allowFileAccess` | `false` | No document residue, no file scheme |
| `injectedJavaScriptBeforeContentLoaded` | `BRIDGE_STUB_SCRIPT` | Installs a `window.__kycBridge.setToken` accessor that queues pre-handler calls and flushes on assignment, so a token that arrives early is not lost |
| `startInLoadingState` / `androidLayerType` | `true` / `'hardware'` | Spinner and camera-surface stability |

## Permissions

`checkPermissions` runs **before** connectivity and before `source.start()`. Anything other than `'granted'` parks on `permissionDenied` with **Try again** (`permissionReason === 'denied'`) or, when `onOpenSettings` is supplied, **Open settings** (`permissionReason === 'blocked'`) - and `onError` is *not* fired, because a denied permission is a recoverable user state, not a failure. When `permissionReason === 'blocked'` and `onOpenSettings` is not supplied, the only affordance is **Cancel**, since retrying in place cannot help. There is no hard dependency on a permission library; omit the prop and the WebView or SDK prompts for itself.

OS declarations remain the host app's job: `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` in `Info.plist`, `android.permission.CAMERA` and `android.permission.RECORD_AUDIO` in the manifest.

## Token refresh

`useTokenRefresh` refuses immediately (`TOKEN_EXPIRED`, session kept) when the source is not `isTokenRefreshable` or there is no session. Otherwise it awaits `refreshToken(session)` and injects `createSetTokenScript(token)` into the WebView. Two guards: `mountedRef` drops anything that resolves after unmount, and a monotonic `seqRef` means only the newest refresh may inject - latest wins. A rejection becomes `TOKEN_REFRESH_FAILED` with the session kept, so the error screen offers Restart.

## Component hierarchy

[![Component Hierarchy](../diagrams/dist/component-hierarchy.svg)](../diagrams/src/component-hierarchy.mmd)

## Testing strategy

- **Unit (Jest, 100%):** the machine's tests live in core; here, the hook, the token-refresh guards, the WebView props as data, the navigation guard, the component's screens, and a guard test that `./hosted` never reaches Apollo.
- **Test doubles:** `__mocks__/react-native-webview.tsx` (exposes `getWebViewProps`, `getInjectedScripts`, `simulateWebViewMessage`, `simulateRawWebViewMessage`, `simulateWebViewError`, `simulateWebViewHttpError`, `resetWebViewMock`) and `__mocks__/@react-native-community/netinfo.ts` (`setMockNetworkState`, `resetMockNetworkState`). Both are shared with the demo's Jest config.
- **E2E (Maestro):** six default flows plus two `fake-native`-tagged flows - see [../integration/native-sdk.md](../integration/native-sdk.md) and `examples/react-native-demo/README.md`. Every testID is the same under `KYC_UI=themed`, so the flows run under either look.

## Demo critical paths

- `examples/react-native-demo/src/source.ts` - `buildSource(KYC_MODE)`: one `VerificationSource` per mode, the whole integration a host writes (hosted mode dogfoods the `/hosted` import).
- `src/config.ts` - `KYC_MODE` / `KYC_UI`, inlined at bundle time by Babel (`resolveKycMode` / `resolveKycUi` keep the branches testable).
- `src/theme.ts` - Blink's palette and Spanish copy, what a branded host hands the component.
- `App.tsx` - the screen contract Maestro drives (`mode-label`, `reset-button`, `outcome`, the fake SDK overlay); at 100% coverage with the callbacks driven by a scripted fake.
