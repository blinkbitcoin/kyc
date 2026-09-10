# Mode 1 - Native provider SDK

**Updated:** 2026-09-06

The provider's SDK runs **in-process**: on React Native, `@sumsub/react-native-mobilesdk-module` presents its own full-screen flow, so there is no WebView, no bridge and no hosted page. This is the best camera and liveness UX available, and it is the mode a real deployment should prefer on mobile.

## What you need

1. `@blinkbitcoin/kyc-react-native` - the native source is its `/sumsub` entry.
2. The provider SDK peer: `@sumsub/react-native-mobilesdk-module` (≥1.40), plus `pod install` on iOS.
3. **A backend that mints provider access tokens.** This repo's `examples/full-service-demo` does, but any backend of yours will do - the package only ever calls a callback you supply.

```sh
npm i @blinkbitcoin/kyc-react-native \
      @sumsub/react-native-mobilesdk-module react-native-webview @react-native-community/netinfo
cd ios && bundle exec pod install
```

## Wiring

```tsx
import { IdentityVerification } from '@blinkbitcoin/kyc-react-native';
import { createSumsubNativeSource } from '@blinkbitcoin/kyc-react-native/sumsub';

const source = createSumsubNativeSource({
  getAccessToken: async () => {
    const { accessToken } = await yourApi.startVerification(); // your backend
    return accessToken;
  },
  locale: 'en',
});

<IdentityVerification
  source={source}
  onComplete={(result) => console.log(result.status, result.applicantId)}
  onError={(error) => console.warn(error.code, error.message)}
  onCancel={() => navigation.goBack()}
/>;
```

`getAccessToken` is the whole host seam. It is called once by `start()` and again, by the SDK itself, whenever the token expires - which is why a native source has **no** `refreshToken` and `isTokenRefreshable(source)` is correctly `false`.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `getAccessToken` | `() => Promise<string>` | - | Required. Also the SDK's expiration handler |
| `locale` | `string` | - | Passed to `withLocale` only when set |
| `debug` | `boolean` | `false` | Routes the SDK's log stream to `console` with a `[kyc-sumsub]` prefix |
| `sdk` | `SumsubSdkLike` | the real module | Injection point for tests |

## What the component does in this mode

`isLaunchable(source)` is true, so **no WebView is rendered**. The component shows its `launch-screen` while `source.launch(session, onEvent)` runs and the SDK owns the screen. The resolved `IdentityVerificationResult` is the terminal `complete`. A `cancel` emitted before resolution means the user aborted and the resolved status is advisory (typically `incomplete`); a rejection is a real failure and becomes the error state.

**Known v1 limitations:** the SDK screen cannot be dismissed programmatically once launched - the only way out is the user's own action inside it. A second `launch()` call while one is already running is rejected outright (`SDK_UNAVAILABLE`, "launch already in progress") rather than racing the first over the same screen; the component itself never issues a concurrent launch, but a host driving the source directly should be aware of it.

## Permissions

The SDK prompts for the camera itself. If you want to preflight - to show your own explainer, or to route a permanently blocked permission to Settings - pass `checkPermissions`:

```tsx
<IdentityVerification
  source={source}
  checkPermissions={async () => {
    const result = await request(PERMISSIONS.IOS.CAMERA);
    return result === RESULTS.BLOCKED ? 'blocked' : result === RESULTS.GRANTED ? 'granted' : 'denied';
  }}
  onOpenSettings={openSettings}
/>
```

There is **no hard dependency** on a permissions library. Omit the prop and the SDK prompts; a `denied` or `blocked` answer parks on the `permission-screen` with **Try again** (and **Open settings** when `onOpenSettings` is supplied) and deliberately does **not** call `onError`.

Declare the OS strings yourself: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `android.permission.CAMERA`, `android.permission.RECORD_AUDIO`.

## Without the SDK installed

`start()` rejects with `SDK_UNAVAILABLE` ("Identity verification is unavailable in this build."). This is deliberate: the peer is optional so that hosts using only modes 2 and 3 never pull a CocoaPods dependency, and a missing peer fails closed with a coded error instead of a native crash.

## Testing this mode without credentials

The repo ships a UI-free test double for the launch branch, so the whole `isLaunchable` path is exercisable offline:

```ts
import { createFakeLaunchableSource } from '@blinkbitcoin/kyc-core/testing';

const fake = createFakeLaunchableSource({ outcome: 'manual', applicantId: 'demo-applicant' });
// fake.controller.approve() / .decline() / .cancel() / .fail(code, message)
```

`outcome` accepts `'approved' | 'declined' | 'cancel' | 'error' | 'manual'`; `'manual'` waits for the controller, which is what makes it drivable from an E2E flow. The React Native demo's `KYC_MODE=fake-native` does exactly this and puts a `fake-sdk-screen` overlay with `fake-sdk-approve` / `fake-sdk-decline` / `fake-sdk-cancel` on screen while `launch()` runs; `make e2e-fake-native` drives it (manually - an Android emulator with its own `KYC_MODE=fake-native` Metro, not part of the default CI E2E run).

The real Sumsub sandbox is **not** in CI. Its manual checklist is [sumsub.md](sumsub.md).

## Web

There is no in-process mode on the web in v1: Sumsub's web SDK is itself an iframe, so the hosted mode already covers the browser. The seam exists - a source implementing `MountableSource` is handed a `<div data-testid="verification-mount">` instead of a url - but no adapter ships. See [../architecture/web.md](../architecture/web.md#the-mountable-seam).
