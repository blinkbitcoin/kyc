# @blinkbitcoin/kyc-react-native

Plug-and-play identity verification (KYC) for React Native. One component,
one hook, three integration modes — the app never learns a provider name.

```sh
npm install @blinkbitcoin/kyc-react-native react-native-webview @react-native-community/netinfo
```

| Peer | Version | Needed for |
|------|---------|-----------|
| `react` / `react-native` | ≥19 / ≥0.83 | always |
| `react-native-webview` | ≥14 | the hosted-page mode |
| `@react-native-community/netinfo` | ≥11 | the offline state |
| `@apollo/client` + `graphql` | ^4 / ^16‖^17 | **proxy mode only** (optional) |

Import from `@blinkbitcoin/kyc-react-native/hosted` unless you use proxy
mode: that entry is Apollo-free by construction (guarded by a test), so the
GraphQL peers never have to be installed.

## Modes

### 1. Native provider SDK

The provider SDK runs in-process; no WebView is rendered.

```tsx
import { Verification } from '@blinkbitcoin/kyc-react-native/hosted';
import { createSumsubNativeSource } from '@blinkbitcoin/kyc-react-native/sumsub';

const source = createSumsubNativeSource({ getAccessToken: fetchTokenFromYourApi });

<Verification
  source={source}
  onComplete={(result) => console.log(result.status)}
  onError={(error) => console.warn(error.code, error.message)}
  onCancel={() => navigation.goBack()}
/>;
```

### 2. Hosted page

A page that speaks the `kyc-bridge` protocol (this repo's `examples/full-service-demo` serves
one) is embedded in a hardened WebView.

```tsx
import { Verification } from '@blinkbitcoin/kyc-react-native/hosted';
import { createHostedSource } from '@blinkbitcoin/kyc-react-native/hosted';

const source = createHostedSource({
  getSession: async () => yourApi.startVerification(),  // must return { url }
  refreshToken: async (session) => yourApi.refreshToken(session.sessionId),
  // omit refreshToken and an expired token becomes a Restart prompt
});

<Verification
  source={source}
  allowedNavigationOrigins={['https://*.sumsub.com']}
  onComplete={onComplete}
  onError={onError}
  onCancel={onCancel}
/>;
```

### 3. Proxy session

Full orchestration against this repo's backend (needs the Apollo peers, so
import from the package root).

```tsx
import {
  createKycApolloClient,
  createProxySource,
  Verification,
} from '@blinkbitcoin/kyc-react-native';
import { Platform } from 'react-native';

const client = createKycApolloClient({ uri: API_URL, getAuthToken });
const source = createProxySource({
  client,
  platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
});
```

### Testing without the native module

`__mocks__/@sumsub/react-native-mobilesdk-module.ts` ships with this package:
a complete fake of the builder chain (records `withHandlers` / `withDebug` /
`withLocale`, drives `onStatusChanged` / `onEvent` / `onLog`, resolves or
rejects `launch()`). Point your Jest at it so your unit tests never load the
native module:

```js
moduleNameMapper: {
  '^@sumsub/react-native-mobilesdk-module$':
    '<rootDir>/node_modules/@blinkbitcoin/kyc-react-native/__mocks__/@sumsub/react-native-mobilesdk-module.ts',
}
```

Or inject a double directly: `createSumsubNativeSource({ getAccessToken, sdk })`.

## Permissions

The WebView is configured with `mediaCapturePermissionGrantType="grant"`, so
the *page* is granted capture without a second prompt — but the OS-level
permission is still the app's job.

That prop is **iOS/macOS only**. Android has no equivalent: there,
react-native-webview answers the page's `onPermissionRequest` for any origin
it hosts as long as the app itself holds the OS permission, which is one more
reason the origin pin above matters. Declare the OS permissions either way:

`ios/<App>/Info.plist`
```xml
<key>NSCameraUsageDescription</key>
<string>We need your camera to verify your identity.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Some verification steps record a short video with sound.</string>
```

`android/app/src/main/AndroidManifest.xml`
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

Optionally preflight with whatever permission library the app already uses —
there is no hard dependency on one:

```tsx
<Verification
  source={source}
  checkPermissions={async () => {
    const result = await request(PERMISSIONS.IOS.CAMERA);
    return result === RESULTS.GRANTED ? 'granted' : 'denied';
  }}
  onOpenSettings={openSettings}
/>
```

Both refusals show a dedicated screen carrying the affordance that can
actually resolve them: **Try again** for `denied` (the OS will ask again),
**Open settings** for `blocked` — and only when `onOpenSettings` is given,
without it that screen is informational. Neither is an error: `onError` is
not called for them, exactly like the offline state.

## `<Verification />` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `VerificationSource` | — | The mode. See the three factories above. |
| `onComplete` | `(result: VerificationResult) => void` | — | Terminal outcome, including `pending`, `declined` and `finallyRejected`. |
| `onError` | `(error: { code, message }) => void` | — | Failures only (never offline / permission-denied). |
| `onCancel` | `() => void` | — | User aborted. |
| `onStatusChange` | `(status: VerificationStatus) => void` | — | Every intermediate status. |
| `label` | `string` | `'Verify identity'` | Idle-screen title and button. |
| `successDelayMs` | `number` | `1500` | Success screen before `onComplete` (approvals only). |
| `checkPermissions` | `() => Promise<'granted' \| 'denied' \| 'blocked'>` | — | Camera preflight. |
| `onOpenSettings` | `() => void` | — | Adds an "Open settings" button to the permission screen —<br>shown only when the preflight reported `'blocked'`. |
| `allowedNavigationOrigins` | `string[]` | `[]` | Extra origins the page may navigate to (whitelist **and** guard);<br>`'https://*.sumsub.com'` style wildcards allowed. |
| `renderLoading` | `() => ReactElement` | — | Custom loading view inside the WebView. |
| `style` | `StyleProp<ViewStyle>` | — | Applied to the root view the component renders<br>(the page and every screen live inside it). |

## `useVerification(source, options)`

The component is a thin UI over this hook; use it directly for a custom look.

```tsx
const {
  status,      // 'idle' | 'loading' | 'verifying' | 'pending' | 'success'
               // | 'permissionDenied' | 'error' | 'offline'
  session,     // the running VerificationSession, or null
  result,      // the terminal VerificationResult, or null
  error,       // { code, message } | null
  permissionReason,  // 'denied' | 'blocked' | null (with 'permissionDenied')
  start, retry, restart, cancel,
  handleMessage,   // feed the WebView's raw onMessage payload in
  handleEvent,     // feed an already-normalized VerificationEvent in
  webViewRef,      // attach to <HostedWebView> so refreshes can be injected
} = useVerification(source, { onComplete, onError, onCancel });
```

- `success` means **approved**. Every other terminal status renders as the
  outcome screen (`status === 'pending'`) with `result.status` carrying the
  detail — `describeOutcome(result.status)` is the copy the component uses.
  The hosted page stays mounted (hidden) across `verifying → pending`, so a
  late message — a decision, a token refresh — still reaches the hook.
- `start()` is a no-op while a run is still in flight; `retry()` re-runs the
  whole flow, and `restart()` additionally drops the stored session, which is
  what a `TOKEN_EXPIRED` / `TOKEN_REFRESH_FAILED` error screen offers.
- `permissionReason` says whether the preflight can be re-asked in place
  (`'denied'`) or only the OS settings can change it (`'blocked'`); the
  default UI offers exactly the affordance that can resolve it.
- Token refresh is automatic when the source implements `refreshToken`: the
  page's `tokenExpired` triggers `refreshToken(session)` and the new token is
  injected as `window.__kycBridge.setToken(...)`. A refresh that arrives
  while the page is still loading is queued by the injected bridge stub, and
  only the newest refresh may inject.

## `<HostedWebView />` and `createHostedWebViewProps`

`createHostedWebViewProps({ url, allowedOrigin, allowedNavigationOrigins })`
is the single place the WebView is hardened, exported so it can be reviewed
and reused: `javaScriptEnabled`, `domStorageEnabled`,
`allowsInlineMediaPlayback`, `mediaPlaybackRequiresUserAction: false`,
`mediaCapturePermissionGrantType: 'grant'`, `originWhitelist` pinned to the
session origin **plus the declared `allowedNavigationOrigins`**, an
`onShouldStartLoadWithRequest` guard that blocks every other origin,
`setSupportMultipleWindows: false`, `cacheEnabled: false`,
`allowFileAccess: false`, and the `injectedJavaScriptBeforeContentLoaded`
bridge stub.

What the pin does and does not buy you:

- The guard runs for **every navigation the platform reports, subframes
  included** — not just the top-level document.
- `originWhitelist` is checked **first**. A URL that misses it never reaches
  the guard: react-native-webview escalates it to the system browser
  (`Linking.openURL`) instead of dropping it. That is why the provider
  origins have to be in the whitelist as well as in the guard.
- On Android an unanswered `shouldOverrideUrlLoading` is **allowed** after
  250 ms, so a busy device can let a navigation through before the guard
  answers.

Treat the pin as defence in depth, not as a sandbox: the page you load is
still trusted code.

## v1 limitation

A native provider SDK launch (mode 1) cannot be dismissed programmatically
once it is showing: `cancel()` only works before `launch()` is called or
after it resolves. The SDK owns its own screen and its own back/close
button; there is no cross-platform API to close it from JS mid-flight.
