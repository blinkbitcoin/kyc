# Consuming the Packages in Another App

**Updated:** 2026-09-06

The four packages publish to **GitHub Packages** under the `blinkbitcoin` org:

| Package | For |
|---------|-----|
| `@blinkbitcoin/kyc-react-native` | React Native apps |
| `@blinkbitcoin/kyc-react` | React web apps |
| `@blinkbitcoin/kyc-sumsub` | The Sumsub adapters (mode 1, and the shared mapping) |
| `@blinkbitcoin/kyc-core` | Transitive dependency of the other three; also usable standalone |

Publishing has two channels, both gated on the full fleet (unit coverage thresholds plus the backend, web and Android E2E suites):

- **Stable** (`latest`): publish a **GitHub Release** with tag `vX.Y.Z` (`make release V=X.Y.Z`). The tag *is* the version - CI stamps it into the packages at publish time and nothing is committed. It ships once the commit's push-to-`main` run is green; a red one blocks it and the publish is retried automatically when main turns green. GitHub Packages rejects re-publishing an existing version, so a failed release needs a new tag.
- **Prerelease** (`next`): every push to `main` (or a manual `ci.yml` dispatch) ships `<next patch after the latest tag>-pre.<run>.<sha>`. Install with `npm i @blinkbitcoin/kyc-react-native@next`.

In both channels the three dependent packages pin `@blinkbitcoin/kyc-core` to exactly their own version.

## Registry setup (consuming app)

GitHub Packages requires auth even for reads. In the consuming repo:

```ini
# .npmrc
@blinkbitcoin:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` needs `read:packages`. In CI, `actions/setup-node` with `registry-url: https://npm.pkg.github.com` and `scope: '@blinkbitcoin'` does the same thing.

## Minimal install: hosted mode, React Native

The smallest possible dependency set - no Apollo, no GraphQL, no provider SDK:

```sh
npm i @blinkbitcoin/kyc-react-native react-native-webview @react-native-community/netinfo
# note: no @apollo/client, no graphql - the /hosted entry never reaches them
```

```tsx
import { createHostedSource, Verification } from '@blinkbitcoin/kyc-react-native/hosted';

const source = createHostedSource({
  getSession: async () => yourApi.startVerification(), // must return { url }
});

<Verification
  source={source}
  onComplete={(result) => console.log(result.status)}
  onError={(error) => console.warn(error.code, error.message)}
  onCancel={() => navigation.goBack()}
/>;
```

Why the subpath matters: Metro resolves the `react-native` export condition straight to `./src/hosted.ts`, so nothing in your bundle imports Apollo. On the web there is no subpath and none is needed - `@blinkbitcoin/kyc-react` has a single entry marked `"sideEffects": false`, and a bundler drops what a hosted-only app never imports.

## Minimal install: hosted mode, React web

```sh
npm i @blinkbitcoin/kyc-react
```

```tsx
import { createHostedSource, Verification } from '@blinkbitcoin/kyc-react';
```

Same props, same callbacks. Read [hosted.md](hosted.md) for the three things your page must allow before a browser will hand the frame a camera.

## Peer dependencies

| Peer | Package | Version | Needed for |
|------|---------|---------|-----------|
| `react` | both platform packages | ≥19 (RN) / ≥18 (web) | always |
| `react-native` | `kyc-react-native` | ≥0.83 | always |
| `react-native-webview` | `kyc-react-native` | ≥14 | hosted mode (the `mediaCapturePermissionGrantType` prop is what needs this floor) |
| `@react-native-community/netinfo` | `kyc-react-native` | ≥11 | connectivity handling |
| `@apollo/client` + `graphql` | both, optional | ^4 / ^16 ‖ ^17 | **proxy mode only** |
| `@sumsub/react-native-mobilesdk-module` | `kyc-sumsub`, optional | ≥1.40 | **native SDK mode only** |
| `@sumsub/websdk` | `kyc-sumsub`, optional | ≥2.5 | reserved - no adapter ships in v1 |

Optional peers are never installed by npm on your behalf. Without the Sumsub mobile module, `createSumsubNativeSource().start()` rejects with `SDK_UNAVAILABLE` - which is the intended, testable behaviour rather than a crash.

## Jest in the consuming app

If you use the native SDK source, map the module to the mock this repo ships so your unit tests never load a native module:

```js
moduleNameMapper: {
  '^@sumsub/react-native-mobilesdk-module$':
    '<rootDir>/node_modules/@blinkbitcoin/kyc-sumsub/__mocks__/@sumsub/react-native-mobilesdk-module.ts',
}
```

## Which mode should you use?

| You have | Use | Guide |
|----------|-----|-------|
| A backend that can mint provider access tokens, and you want the native camera UX | Mode 1 | [native-sdk.md](native-sdk.md) |
| A page that speaks the bridge protocol (this repo's `apps/api`, or your own) | Mode 2 | [hosted.md](hosted.md) |
| Nothing yet, and you want session lifecycle, refresh and webhook-backed status handled for you | Mode 3 | [proxy.md](proxy.md) |

Start with the first one that covers your needs. All three drive the same component with the same callbacks.
