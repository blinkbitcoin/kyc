# examples/

Integration reference apps — hosts for the packages, not products. The
client demos show the minimal wiring a real host app needs per mode:
`config.ts` (endpoint + mode literal) → `apollo.ts` (client + auth token) →
`source.ts` (one `VerificationSource` per mode) → one screen with
`<IdentityVerification />`. The server demo here is the **in-process tier** on
`@blinkbitcoin/kyc-node`; the other tier, the whole service, is the
published [`@blinkbitcoin/kyc-service`](../packages/kyc-service/README.md)
package.

| Example | Hosts | Modes | E2E |
|---------|-------|-------|-----|
| [`access-token-demo/`](access-token-demo/README.md) | 🖥️ **In-process tier.**<br>`@blinkbitcoin/kyc-node` from an API you already have | one mutation that mints a provider access token for mode 2: `mock` \| `sumsub` | booted on the mock provider, the mutation called (`make e2e-server-demos`) |
| [`serverless-handler-demo/`](serverless-handler-demo/README.md) | 🖥️ **In-process tier**, as Fetch handlers.<br>`@blinkbitcoin/kyc-node` behind a route handler or<br>edge function (plain Node adapter here) | the access-token preset, `POST /verification/token`: `mock` \| `sumsub` | booted on the mock provider, the route called (`make e2e-server-demos`) |
| [`react-native-demo/`](react-native-demo/README.md) | 📱 `@blinkbitcoin/kyc-react-native` | `KYC_MODE` = native \| hosted \| proxy \| fake-native | Maestro (`make e2e-android`, `make e2e-ios`, `make e2e-fake-native`) |
| [`react-demo/`](react-demo/README.md) | 🌐 `@blinkbitcoin/kyc-react` (Vite) | `VITE_KYC_MODE` = hosted \| proxy | Playwright (`make e2e-web`, `make e2e-web-proxy`) |

The **deployable tier** has no row here because it is not an example: it is
the published [`@blinkbitcoin/kyc-service`](../packages/kyc-service/README.md)
package and its `ghcr.io/blinkbitcoin/kyc-service` image, whose targets are
its [Deploy table](../packages/kyc-service/README.md#deploy). The two tiers
side by side: [Backend options](../README.md#backend-options). That service
is what the client demos run against: this service's policy (session
verification, CORS, rate limits, fail-closed boot) around the package's
presets, schema, store and adapters, as one Fetch core. It is **required
for mode 3 only**, and is also the mock provider that drives every E2E
suite in the repo - which is why the backend, web and mobile suites can run
with no provider credentials at all.

`hosted` and `proxy` need the backend running (`make db-up migrate backend`
from the repo root, or `make e2e-backend-up` for the E2E stack). `native`
needs a backend that can mint provider access tokens **and** the provider SDK
peer installed — it is the manual Sumsub-sandbox mode, never CI.
`fake-native` needs nothing: it swaps the provider SDK for
`createFakeLaunchableSource()` from `@blinkbitcoin/kyc-core/testing` and an
in-app fake SDK screen, so the native-launch branch is testable offline.
`make e2e-fake-native` is Android emulator only - it is not wired for iOS.

`make help` here fans common targets (`test`, `coverage`, `typecheck`) out to
every example; examples with a `Makefile` are discovered automatically
(the service's coverage is 100%, the client demos' a floor).
