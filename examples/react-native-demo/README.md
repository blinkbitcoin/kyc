# kyc-react-native-example

React Native 0.86 host for `@blinkbitcoin/kyc-react-native`: manual testing
and the Maestro E2E target. `KYC_MODE` is inlined at bundle time by Babel
(`transform-inline-environment-variables`), so a mode change means restarting
Metro — not rebuilding the app.

## Modes

| `KYC_MODE` | Source | Needs |
|---|---|---|
| `native` (default) | `createSumsubNativeSource` fed by the backend's access token | Sumsub credentials **and** the `@sumsub/react-native-mobilesdk-module`<br>peer, which this demo deliberately does not install —<br>see "Sumsub sandbox" below |
| `hosted` | `createHostedSource` whose `getSession` is the backend proxy's `start()`<br>and whose `refreshToken` is its `refreshToken()` —<br>how a real app gets a hosted url | backend + database |
| `proxy` | `createProxySource` — the backend owns session, refresh and<br>webhook-driven status | backend + database |
| `fake-native` | `createFakeLaunchableSource({ outcome: 'manual' })` plus the in-app<br>fake SDK screen | nothing |

```bash
make start                       # KYC_MODE=native
KYC_MODE=hosted npm start        # from this directory
make ios / make android          # from the repo root
KYC_UI=themed npm start          # the same flow under Blink's palette and Spanish copy
```

`KYC_UI` (inlined the same way) picks the look: `default` is the
component's own copy and colors, `themed` hands it the `theme` and
`labels` props from `src/theme.ts` - what a branded, multilingual host
writes. The testIDs are the same in both, so every Maestro flow runs
under either.

## Screen contract

The screen exists to be driven by Maestro: `mode-label` (`mode: <KYC_MODE>`),
`reset-button` ("Start over", remounts the flow with a fresh source),
`outcome` (the last host callback), and in `fake-native` mode the overlay
`fake-sdk-screen` with `fake-sdk-approve` / `fake-sdk-decline` /
`fake-sdk-cancel`. Everything else (`verification-start-button`,
`verification-cancel-button`, `verification-webview`, `loading-indicator`,
`launch-screen`, `success-screen`, `pending-screen`, `pending-message`,
`permission-screen`, `offline-screen`, `check-connection-button`,
`error-screen`, `error-message`, `retry-button`, `restart-button`) belongs to
the library.

## Permissions

The demo passes a `checkPermissions` stub that always resolves `granted`, so
the WebView / native SDK prompts for itself. A real host wires its own
permission library instead — there is no hard dependency on one:

```tsx
<Verification
  source={source}
  checkPermissions={async () => {
    const result = await request(PERMISSIONS.IOS.CAMERA);
    if (result === RESULTS.GRANTED) return 'granted';
    return result === RESULTS.BLOCKED ? 'blocked' : 'denied';
  }}
  onOpenSettings={openSettings}
/>
```

`checkPermissions` resolves `'granted' | 'denied' | 'blocked'`, and the reason
picks the affordance the `permission-screen` offers: `retry-button` for
`'denied'` (the user can be asked again) and `open-settings-button` for
`'blocked'` — the latter only when `onOpenSettings` is passed, since without a
settings intent the screen would offer a button that does nothing. A
`'blocked'` result with no `onOpenSettings` is an informational screen with no
button at all.

## E2E

Six flows run by default; the two `fake-native`-tagged flows need their own
Metro and are excluded (`--exclude-tags=fake-native`), which is why the
CI-invoked script names never change. CI itself starts Metro via
`scripts/e2e/metro-start.sh`, which defaults `KYC_MODE` to `hosted` (the
default suite's bundle-time mode) unless the caller overrides it — the
`KYC_MODE=hosted npm start` below is the manual equivalent.

```bash
# Android (what CI runs)
make e2e-backend-up
cd examples/react-native-demo/android && ./gradlew assembleDebug && cd -
emulator -avd <avd> &
KYC_MODE=hosted npm start        # in another terminal, from this directory
make e2e-android
make e2e-backend-down

# The native-launch branch, no backend needed
KYC_MODE=fake-native npm start   # in another terminal
make e2e-fake-native
```

Android networking to the backend is two separate paths, both pointed at the
same backend on the host machine:

- **GraphQL** (`verificationSessionStart`/`Refresh`, the mutations the app
  itself calls): `src/config.ts`'s `getDevBackendHost` resolves to the
  emulator's `10.0.2.2` alias for the host loopback, so `GRAPHQL_URL` is
  `http://10.0.2.2:<KYC_API_PORT>/graphql` (5000 by default; the variable is
  inlined at bundle time like `KYC_MODE`) on Android without any extra setup.
- **The hosted page** (what loads *inside* the WebView): the backend mints
  its URL from `PUBLIC_BASE_URL`, which stays `http://localhost:<port>` for
  both Chromium and the emulator - so the Android runner does
  `adb reverse tcp:<port> tcp:<port>` (`scripts/e2e/android-maestro.sh`) to make
  the emulator's `localhost:<port>` actually reach the host, which is what
  makes `http://localhost:<port>/hosted/<id>` load inside the emulator's
  WebView. If a runner ever drops that reverse, override `PUBLIC_BASE_URL`
  to `http://10.0.2.2:<port>` for the Android job only - GraphQL doesn't need
  this because it already goes through `10.0.2.2` directly.

## Sumsub sandbox (manual)

`native` mode is not exercised by CI. Install
`@sumsub/react-native-mobilesdk-module`, point the backend at
`KYC_PROVIDER=sumsub` with real credentials, and follow the checklist in
`docs/integration/sumsub.md`. Without the peer installed, `start()` fails
closed with `SDK_UNAVAILABLE` — which is the intended behaviour, and what
Jest exercises through the shared mock in
`packages/kyc-react-native/__mocks__/`.
