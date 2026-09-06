# kyc-react-native-example

React Native 0.86 host for `@blinkbitcoin/kyc-react-native`: manual testing
and the Maestro E2E target. `KYC_MODE` is inlined at bundle time by Babel
(`transform-inline-environment-variables`), so a mode change means restarting
Metro — not rebuilding the app.

## Modes

| `KYC_MODE` | Source | Needs |
|---|---|---|
| `native` (default) | `createSumsubNativeSource` fed by the backend's access token | Sumsub credentials **and** the `@sumsub/react-native-mobilesdk-module` peer, which this demo deliberately does not install — see "Sumsub sandbox" below |
| `hosted` | `createHostedSource` whose `getSession` is the backend proxy's `start()` and whose `refreshToken` is its `refreshToken()` — how a real app gets a hosted url | backend + database |
| `proxy` | `createProxySource` — the backend owns session, refresh and webhook-driven status | backend + database |
| `fake-native` | `createFakeLaunchableSource({ outcome: 'manual' })` plus the in-app fake SDK screen | nothing |

```bash
make start                       # KYC_MODE=native
KYC_MODE=hosted npm start        # from this directory
make ios / make android          # from the repo root
```

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

The Android runner does `adb reverse tcp:4000 tcp:4000`
(`scripts/e2e/android-maestro.sh`), which is what makes the backend's
`http://localhost:4000/hosted/<id>` URL load inside the emulator's WebView —
so `PUBLIC_BASE_URL` stays `http://localhost:4000` for both Chromium and the
emulator. If a runner ever drops that reverse, override `PUBLIC_BASE_URL` to
`http://10.0.2.2:4000` for the Android job only.

## Sumsub sandbox (manual)

`native` mode is not exercised by CI. Install
`@sumsub/react-native-mobilesdk-module`, point the backend at
`KYC_PROVIDER=sumsub` with real credentials, and follow the checklist in
`docs/integration/sumsub.md`. Without the peer installed, `start()` fails
closed with `SDK_UNAVAILABLE` — which is the intended behaviour, and what
Jest exercises through the shared mock in
`packages/kyc-sumsub/__mocks__/`.
