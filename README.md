# kyc

[![Unit](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/unit.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![E2E](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/e2e.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![Coverage](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/coverage.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

<sub>Badges render once the first `main` run publishes them to `gh-pages`. E2E covers backend, web, Android and the iOS simulator suite, see [CI/CD](docs/development-guide.md#ios-e2e-and-the-macos-runner).</sub>

<p align="center">
  <img src="docs/assets/readme-hero.svg" alt="Your React Native or React web app renders one IdentityVerification component. The end user photographs an ID document, takes a selfie with a liveness check, and gets a verdict: approved, pending or declined. A VerificationSource picks one of three modes: a hosted page embedded in a hardened WebView or origin-pinned iframe, the native provider SDK in-process, or a proxy session on the reference backend. The two backend-backed modes go through the optional examples/full-service-demo service, and every mode ends at Sumsub." width="960">
</p>

Embedded identity verification (KYC) for React Native and React web apps.
One `IdentityVerification` component, one `useIdentityVerification` hook, provider-agnostic -
Sumsub is the default provider and the only one implemented, and the app
never learns its name.

The hard parts are the ones this library actually solves: camera and
microphone permissions inside a WebView (the `mediaCapturePermissionGrantType`
that WKWebView and Android both need), an origin-pinned `postMessage` channel
instead of an open one, token refresh that survives a slow reviewer, and a
webhook-backed status that a replayed callback cannot downgrade.

| Mode | What it is | What your app installs | Backend required |
|------|-----------|------------------------|------------------|
| **1. Hosted page** | A page speaking the<br>`kyc-bridge` protocol, embedded<br>in a hardened WebView or an<br>origin-pinned iframe | One package via the<br>Apollo-free `/hosted`<br>entry - **no Apollo,<br>no GraphQL** | The page (this<br>repo's `examples/full-service-demo`,<br>or your own) |
| **2. Native SDK** | The provider SDK runs in-process<br>(a React Native native module);<br>your app supplies an<br>access-token callback | `kyc-react-native`<br>(its `/sumsub` entry) +<br>the Sumsub SDK peer | Any backend that<br>mints provider<br>access tokens<br>(`kyc-server` does;<br>`examples/access-token-demo`<br>shows one mutation) |
| **3. Proxy session** | Full orchestration: session<br>creation, token refresh,<br>webhook status sync,<br>status query | The package +<br>`@apollo/client` +<br>`graphql` | This repo's backend<br>service (`examples/full-service-demo`) |

**Which mode?** Hosted if you can serve (or point at) a page - it is the
smallest install and the same on both platforms. Native SDK if the camera
UX on a phone is what matters and your API can mint a provider token.
Proxy if you want this repo's backend to own the session lifecycle and the
webhook-backed status. The Apollo wiring and the GraphQL backend exist for
**mode 3 only**; nothing of it ships with modes 1 and 2. Reading path: the
[Integration](#integration) section below in order, then the package README
for your platform, then [docs/integration/](docs/integration/consuming.md)
for the mode you picked.

## Integration

Every mode drives the **same component with the same callbacks** - the only
thing that changes is the `VerificationSource` you pass in:

```tsx
<IdentityVerification source={source} onComplete={…} onError={…} onCancel={…} />
```

The modes below go from simplest to most capable. **Start with the first one
that covers your needs.**

### 1. Hosted page - the simplest (no Apollo, no provider SDK)

**Use when:** you have, or can serve, a page that speaks the bridge protocol.
This repo's `examples/full-service-demo` serves one at `GET /hosted/:sessionId`, and the whole
contract a page must honour is three bullet points.

```sh
npm i @blinkbitcoin/kyc-react-native react-native-webview @react-native-community/netinfo
# note: no @apollo/client, no graphql - the /hosted entry never reaches them
```

```tsx
import { createHostedSource, IdentityVerification } from '@blinkbitcoin/kyc-react-native/hosted';

const source = createHostedSource({
  getSession: async () => yourApi.startVerification(),   // -> { url }
  refreshToken: async (s) => yourApi.refreshToken(s.sessionId),   // optional
});

<IdentityVerification
  source={source}
  onComplete={(result) => console.log(result.status)}
  onError={(error) => console.warn(error.code, error.message)}
  onCancel={() => navigation.goBack()}
/>;
```

The WebView is hardened in one place (`mediaCapturePermissionGrantType: 'grant'`,
an origin allow-list, a navigation guard, no popups, no file access), and the
`allowedOrigin` the messages are pinned to is derived from the page url when
you do not supply one. Details, and the three things a **web** host page must
allow before a browser hands the frame a camera:
[docs/integration/hosted.md](docs/integration/hosted.md).

### 2. Native SDK - the best camera UX (one backend endpoint)

**Use when:** you are on mobile and want the provider's own full-screen
capture and liveness flow rather than a WebView. The provider SDK needs an
access token, and minting one needs a provider app token, which must never
sit in a mobile bundle - so this mode needs one authenticated endpoint on
your backend.

```sh
npm i @blinkbitcoin/kyc-react-native @sumsub/react-native-mobilesdk-module
cd ios && bundle exec pod install
```

```tsx
import { IdentityVerification } from '@blinkbitcoin/kyc-react-native';
import { createSumsubNativeSource } from '@blinkbitcoin/kyc-react-native/sumsub';

const source = createSumsubNativeSource({
  getAccessToken: async () => (await yourApi.startVerification()).accessToken,
});
```

No WebView is rendered: the component detects `isLaunchable(source)` and hands
the screen to the SDK. `getAccessToken` doubles as the SDK's own expiration
handler, so there is nothing to refresh. Without the SDK peer installed the
source fails closed with `SDK_UNAVAILABLE` rather than crashing - and
`createFakeLaunchableSource` from `@blinkbitcoin/kyc-core/testing` lets you
drive the whole launch branch in tests and E2E with no credentials at all.
[docs/integration/native-sdk.md](docs/integration/native-sdk.md).

### 3. Proxy session - full orchestration (this repo's backend service)

**Use when:** you want sessions, token refresh, provider webhooks and an
authoritative status handled for you, and you are willing to run `examples/full-service-demo`.

```sh
npm i @blinkbitcoin/kyc-react-native @apollo/client graphql
```

1. Run the service and point it at your provider credentials:

```bash
make db-up migrate backend      # dev Postgres, migrations, server on :5100
```

2. Register `https://your-api/webhook/kyc/sumsub` in the provider dashboard.
3. Wire the client:

```tsx
import {
  createKycApolloClient,
  createProxySource,
  IdentityVerification,
} from '@blinkbitcoin/kyc-react-native';

const client = createKycApolloClient({ uri: API_URL, getAuthToken });
const source = createProxySource({ client, platform: 'IOS' });
```

The backend persists one `VerificationSession` row per attempt with an audit
trail, and its terminal-state guard means a replayed webhook can never
downgrade an `approved` user.
[docs/integration/proxy.md](docs/integration/proxy.md).

### Web apps

Everything above applies to `@blinkbitcoin/kyc-react`, with an origin-pinned
`<iframe>` in place of the WebView and `navigator.onLine` in place of NetInfo,
and the same Apollo-free `/hosted` entry, so a host that ships both platforms
writes the same import on both. Both components take `theme`, `styles` and
`labels`, so a branded, multilingual host never renders the built-in copy.
Start at [packages/kyc-react/README.md](packages/kyc-react/README.md) and
[docs/integration/hosted.md](docs/integration/hosted.md).

## Repository Layout

Ordered by how likely you are to need each part:

| Path | What lives there |
|------|------------------|
| [`packages/kyc-react-native/`](packages/kyc-react-native/README.md) | The React Native library you install:<br>`IdentityVerification`, `useIdentityVerification`, the<br>hardened hosted WebView, and the Sumsub<br>native-SDK source on its `/sumsub` entry. |
| [`packages/kyc-react/`](packages/kyc-react/README.md) | The same pair for React web, over an<br>origin-pinned iframe. |
| [`packages/kyc-server/`](packages/kyc-server/README.md) | The server half a backend installs: Sumsub<br>token minting and webhook verification, the<br>session domain, the hosted page, an Express<br>router and a Knex store. This repo's<br>backend is built on it. |
| [`packages/kyc-core/`](packages/kyc-core/README.md) | The shared core both libraries build on:<br>`VerificationSource`, the capability guards,<br>the bridge protocol, the state machine, the<br>error-code contract, and the Sumsub mapping<br>on `/sumsub`. It arrives as a dependency -<br>you never install it directly. |
| [`examples/full-service-demo/`](examples/full-service-demo/README.md) | The reference backend on `kyc-server`:<br>Express + Apollo + Postgres, this service's<br>policy around the package. Needed for mode<br>3 only; the backend every E2E suite runs<br>against. |
| [`examples/access-token-demo/`](examples/access-token-demo/README.md) | The other server shape: an existing GraphQL<br>API adds one mutation that mints a provider<br>access token for the native SDK (mode 2). |
| [`examples/react-native-demo/`](examples/react-native-demo/README.md) | The React Native host: every `KYC_MODE`,<br>the themed variant, the Maestro suite. |
| [`examples/react-demo/`](examples/react-demo/README.md) | The web host: both `VITE_KYC_MODE`s, the<br>themed variant, the Playwright suites on<br>per-worktree ports. |
| `scripts/` | The `tooling` workspace the Makefile and<br>CI run: `ci/`, `e2e/`, `release/`, with<br>the logic in `lib/*.mjs` at 100% coverage. |
| `docs/` | Documentation of how everything currently<br>works - start at [docs/index.md](docs/index.md);<br>the rules behind the layout are in<br>[docs/architecture/principles.md](docs/architecture/principles.md). |

## Development

Only needed if you are working on the packages themselves - **consuming them
requires none of this**.

```sh
make install                             # npm ci across all workspaces (also installs git hooks)
direnv allow . && direnv allow examples/full-service-demo  # once per machine (loads env + the nix flake dev shell)
```

**Working on the packages**

```sh
make test                                # unit suites + lint + typecheck + format check
make coverage                            # 100% on the four packages, examples/full-service-demo, and scripts/lib
npm test -w @blinkbitcoin/kyc-react -- useIdentityVerification    # one suite
```

**Running the demos**

```sh
make db-up migrate backend               # the reference backend on :5100 (mock provider)
make start && make ios                   # RN demo (or: make android)
make web                                 # web demo on :5101
```

**Real Sumsub** is opt-in: `make sumsub-env` writes the sandbox credentials,
`make e2e-live` runs the API tier against the real sandbox (in CI the
`Live Sumsub` job, `E2E_LIVE=true` or the `e2e:live` label), and the device
matrix stays manual - [docs/integration/sumsub.md](docs/integration/sumsub.md).

`make help` lists all targets (thin wrappers over the npm workspace scripts):

| Target | Purpose |
|--------|---------|
| `make test`<br>`make coverage` | Unit suites + lint + typecheck + format check / coverage thresholds |
| `make check-ci`<br>`make shellcheck` | actionlint + shellcheck over the workflows and scripts |
| `make codegen`<br>`make codegen-check` | Emit `schema.graphql` and regenerate the client types / fail on drift |
| `make diagrams`<br>`make diagrams-check` | Render `docs/diagrams/dist/*.svg` and reassemble the page / fail on drift |
| `make docs-check` | Warn on architecture changes without docs; fail on a stale diagram SVG |
| `make e2e-backend` | Backend E2E with a dockerized Postgres |
| `make e2e-web`<br>`make e2e-web-proxy` | Playwright, hosted and proxy - both build the libraries first<br>and bundle the demo against their dist. Every service is<br>`KYC_PORT_BASE` (5100) + its offset, so one variable moves a<br>worktree (`KYC_PORT_BASE=5300 make e2e-web`) |
| `make e2e-android`<br>`make e2e-ios`<br>`make e2e-fake-native` | Maestro suites (see `make help` for the prerequisites) |
| `make version`<br>`make release` | What CI would publish / merge the release PR release-please<br>maintains ([docs/releasing.md](docs/releasing.md)) |

Coverage is enforced at 100% on all four packages, `examples/full-service-demo`, and
`scripts/lib`, with an 80% floor on the demos. See
[docs/development-guide.md](docs/development-guide.md)
for the full workflow and [CONTRIBUTING.md](CONTRIBUTING.md) for commit and PR
conventions.

Built the way [blinkbitcoin/esign](https://github.com/blinkbitcoin/esign) was.
