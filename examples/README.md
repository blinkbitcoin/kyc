# examples/

Integration reference apps — hosts for the packages, not products. Each shows
the minimal wiring a real host app needs per mode (`KYC_MODE` /
`VITE_KYC_MODE`: native, hosted, or proxy - source building, callbacks,
platform URL/token handling).

| Example | Hosts |
|---------|-------|
| [`react-native-demo/`](react-native-demo/README.md) | 📱 `@blinkbitcoin/kyc-react-native` (React Native; Maestro end-to-end target) |
| [`react-demo/`](react-demo/README.md) | 🌐 `@blinkbitcoin/kyc-react` (Vite) |

Hosted and proxy modes need the backend running (`make db-up migrate
backend` from the repo root); native mode needs only a backend that can mint
Sumsub access tokens. `make help` here fans common targets (`test`,
`coverage`, `typecheck`) out to every example; examples with a `Makefile` are
discovered automatically.
