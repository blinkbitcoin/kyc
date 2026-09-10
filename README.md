# kyc

[![Unit](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/unit.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![E2E](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/e2e.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![Coverage](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/coverage.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

<sub>E2E covers backend, web and Android; the iOS simulator suite is opt-in (macOS runners), see [CI/CD](docs/development-guide.md#ios-e2e-is-opt-in).</sub>

<p align="center">
  <img src="docs/assets/readme-hero.svg" alt="Your React Native or React web app renders one Verification component. A VerificationSource picks one of three modes: the native provider SDK in-process, a hosted page embedded in a hardened WebView or origin-pinned iframe, or a proxy session on the reference backend. The two backend-backed modes go through the optional apps/api service, and every mode ends at Sumsub." width="960">
</p>

Embedded identity verification (KYC) for React Native and React web apps.
One `Verification` component, provider-agnostic; Sumsub is the default
provider. **Status: bootstrap** — the packages build and publish, the
pipeline is green, and the verification flow lands phase by phase
(see [the design](docs/superpowers/specs/2026-09-05-kyc-design.md)).

| Mode | What it is | What your app installs | Backend required |
|------|-----------|------------------------|------------------|
| **1. Native / Web SDK** | The provider SDK runs in-process (RN native module on mobile, web SDK on web); your app supplies an access-token callback | `kyc-react-native` (or `kyc-react`) + `kyc-sumsub` + the Sumsub SDK peer | Any backend that mints provider access tokens (or this repo's `apps/api`) |
| **2. Hosted page** | The provider web SDK on a page served by `apps/api` (or any page speaking the bridge protocol), embedded in a hardened WebView / origin-pinned iframe | One package via the Apollo-free `/hosted` entry | The hosted page (this repo's `apps/api`, or your own) |
| **3. Proxy session** | Full orchestration: session creation, token refresh, webhook status sync, status query | The package + `@apollo/client` + `graphql` | This repo's backend service (`apps/api`) |

## Repository layout

| Path | Role |
|------|------|
| `packages/kyc-core` | Platform-agnostic core: `VerificationSource` + capability guards, bridge protocol, `ErrorCode` contract |
| `packages/kyc-react-native` | React Native `Verification` component + `useVerification` (hardened WebView for hosted mode) |
| `packages/kyc-react` | React web `Verification` component + `useVerification` (iframe for hosted mode) |
| `packages/kyc-sumsub` | Sumsub adapters: shared mapping, `/react-native` (native SDK), `/web` (web SDK) |
| `apps/api` | Reference backend: provider port, mock + Sumsub adapters, webhook, hosted page |
| `examples/react-native-demo`, `examples/react-demo` | Demo hosts (Maestro / Playwright E2E targets) |

## Development

`make help` lists every target. The ones that matter most: `make install`,
`make test`, `make coverage`, `make check-ci`, `make codegen`, `make diagrams`,
`make e2e-backend`, `make e2e-web`, `make e2e-android`. Full guide:
[docs/development-guide.md](docs/development-guide.md); conventions:
[CONTRIBUTING.md](CONTRIBUTING.md); docs map: [docs/index.md](docs/index.md).

Built the way [blinkbitcoin/esign](https://github.com/blinkbitcoin/esign) was.
