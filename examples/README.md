# examples/

Integration reference apps — hosts for the packages, not products. Each shows
the minimal wiring a real host app needs per mode: `config.ts` (endpoint +
mode literal) → `apollo.ts` (client + auth token) → `source.ts` (one
`VerificationSource` per mode) → one screen with `<IdentityVerification />`.

| Example | Hosts | Modes | E2E |
|---------|-------|-------|-----|
| [`full-service-demo/`](full-service-demo/README.md) | 🖥️ `@blinkbitcoin/kyc-server` (Express 5 + Apollo 5 + Knex/Postgres) | the whole service: `mock` \| `sumsub` via `KYC_PROVIDER` | Vitest against real Postgres (`make e2e-backend`); the backend every other suite runs against |
| [`access-token-demo/`](access-token-demo/README.md) | 🖥️ `@blinkbitcoin/kyc-server` (an existing GraphQL API) | one mutation that mints a provider access token for mode 2: `mock` \| `sumsub` | booted on the mock provider, the mutation called (`make e2e-server-demos`) |
| [`react-native-demo/`](react-native-demo/README.md) | 📱 `@blinkbitcoin/kyc-react-native` | `KYC_MODE` = native \| hosted \| proxy \| fake-native | Maestro (`make e2e-android`, `make e2e-ios`, `make e2e-fake-native`) |
| [`react-demo/`](react-demo/README.md) | 🌐 `@blinkbitcoin/kyc-react` (Vite) | `VITE_KYC_MODE` = hosted \| proxy | Playwright (`make e2e-web`, `make e2e-web-proxy`) |

The service is the reference host of the server package: this service's
policy (helmet, CORS, rate limits, JWT auth, fail-closed boot) around the
package's router, schema, store and adapters. It is **required for mode 3
only**, and is also the mock provider that drives every E2E suite in the
repo - which is why the backend, web and mobile suites can run with no
provider credentials at all.

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
