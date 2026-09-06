# examples/

Integration reference apps — hosts for the packages, not products. Each shows
the minimal wiring a real host app needs per mode: `config.ts` (endpoint +
mode literal) → `apollo.ts` (client + auth token) → `source.ts` (one
`VerificationSource` per mode) → one screen with `<Verification />`.

| Example | Hosts | Modes | E2E |
|---------|-------|-------|-----|
| [`react-native-demo/`](react-native-demo/README.md) | 📱 `@blinkbitcoin/kyc-react-native` | `KYC_MODE` = native \| hosted \| proxy \| fake-native | Maestro (`make e2e-android`, `make e2e-ios`, `make e2e-fake-native`) |
| [`react-demo/`](react-demo/README.md) | 🌐 `@blinkbitcoin/kyc-react` (Vite) | `VITE_KYC_MODE` = hosted \| proxy | Playwright (`make e2e-web`, `make e2e-web-proxy`) |

`hosted` and `proxy` need the backend running (`make db-up migrate backend`
from the repo root, or `make e2e-backend-up` for the E2E stack). `native`
needs a backend that can mint provider access tokens **and** the provider SDK
peer installed — it is the manual Sumsub-sandbox mode, never CI.
`fake-native` needs nothing: it swaps the provider SDK for
`createFakeLaunchableSource()` from `@blinkbitcoin/kyc-core/testing` and an
in-app fake SDK screen, so the native-launch branch is testable offline.
`make e2e-fake-native` is Android emulator only - it is not wired for iOS.

`make help` here fans common targets (`test`, `coverage`, `typecheck`) out to
every example; examples with a `Makefile` are discovered automatically.
