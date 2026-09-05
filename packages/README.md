# packages/

Publishable client libraries — the products of this repo. The platform
packages expose the same public API over a shared core; pick by platform.

| Package | What it is |
|---------|------------|
| [`kyc-core/`](kyc-core/README.md) | 🧩 `@blinkbitcoin/kyc-core` — platform-agnostic core: `VerificationSource` + capability guards, the `kyc-bridge` protocol, hosted + proxy sources, the Apollo client factory, GraphQL operations, `ErrorCode` contract. Dependency of the other three packages. |
| [`kyc-sumsub/`](kyc-sumsub/README.md) | 🔌 `@blinkbitcoin/kyc-sumsub` — Sumsub adapters: shared mapping, `/react-native` (native SDK), `/web` (web SDK) |
| [`kyc-react-native/`](kyc-react-native/README.md) | 📦 `@blinkbitcoin/kyc-react-native` — React Native `Verification` component + `useVerification` (hardened WebView for hosted mode) over core |
| [`kyc-react/`](kyc-react/README.md) | 📦 `@blinkbitcoin/kyc-react` — React web `Verification` component + `useVerification` (iframe for hosted mode) over core |

All four publish to GitHub Packages. Hosted-only consumers use the
Apollo-free `/hosted` subpath entry, and demos/E2E hosts use the equally
Apollo-free `/testing` entry (both guard-tested; `@apollo/client` and
`graphql` are optional peers).

`make help` here fans common targets (`test`, `coverage`, `typecheck`,
`build`, `codegen`, `clean`) out to every package; packages with a `Makefile`
are discovered automatically. Types under `kyc-core/src/generated/`
come from `apps/api/schema.graphql` — edit the backend schema and run
`make codegen`, never the generated files.
