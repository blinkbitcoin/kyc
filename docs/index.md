# Project Documentation Index

**Project:** kyc
**Updated:** 2026-09-06

---

## Project Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Monorepo (npm workspaces): four packages + service + two demo apps |
| **Domain** | Fintech / identity verification (KYC) |
| **Primary Language** | TypeScript |
| **Architecture** | React and React Native packages over a shared core, with an Express/Apollo reference backend |

### Quick Reference

#### Packages - the product

- **`packages/kyc-core`** - platform-agnostic: `VerificationSource` + capability guards, the `kyc-bridge` protocol, the shared state machine, the error-code contract, the hosted and proxy sources. Entries: `.`, `./hosted` (Apollo-free), `./testing`, `./sumsub` (Apollo-free; the one Sumsub mapping, in `providers/sumsub/`).
- **`packages/kyc-server`** - the server half: `createVerificationService` over the provider + store ports, the Sumsub and mock adapters, the hosted page, Fetch handlers, the registry. Entries: `.`, `./express` (router), `./knex` (store + migrations), `./sumsub`.
- **`packages/kyc-react-native`** - `Verification` + `useVerification` over a hardened `react-native-webview`, and the Sumsub native-SDK source in `providers/sumsub/`. Entries: `.`, `./hosted`, `./sumsub`.
- **`packages/kyc-react`** - the same pair over an origin-pinned iframe, plus the `MountableSource` seam; `providers/sumsub/` is reserved for the web-SDK adapter. Entries: `.`, `./sumsub`.

#### The reference backend (`examples/full-service-demo/`)

- **Framework:** Express 5 + Apollo Server 5, Knex 3 / PostgreSQL 15+
- **Entry point:** `examples/full-service-demo/src/index.ts`
- **API:** GraphQL at `/graphql`, hosted page at `/hosted/:sessionId`, webhook at `/webhook/kyc/:provider`, health at `/health`
- **Role:** the reference implementation of mode 3 - and the mock provider that drives every E2E suite

#### Demos (`examples/`)

- **`react-native-demo`** - React Native 0.86, `KYC_MODE` = `native` | `hosted` | `proxy` | `fake-native`, Maestro flows in `.maestro/`
- **`access-token-demo`** - the other server shape: an existing GraphQL API adds one mutation that mints a provider access token for mode 1 (`make e2e-server-demos` boots it)
- **`react-demo`** - Vite + React 19, `VITE_KYC_MODE` = `hosted` | `proxy`, Playwright specs in `e2e/`

---

## Documentation

Organized by namespace - pick by what you are doing:

### `integration/` - using the packages in your app

| Doc | Covers |
|-----|--------|
| [consuming.md](integration/consuming.md) | Registry setup (GitHub Packages), the minimal hosted-only install, peer dependencies, which mode to pick |
| [native-sdk.md](integration/native-sdk.md) | Mode 1: the in-process provider SDK, the `getAccessToken` seam, permissions, and the offline test double |
| [hosted.md](integration/hosted.md) | Mode 2: the `kyc-bridge` protocol, origin pinning, token refresh, what a host page and a hosted page must each allow |
| [proxy.md](integration/proxy.md) | Mode 3: Apollo wiring, the three operations, running the reference backend, reading status later |
| [sumsub.md](integration/sumsub.md) | Sumsub sandbox: dashboard setup, the automated live tier (`make e2e-live`), and the device matrix CI cannot run |
| [error-codes.md](integration/error-codes.md) | Every `onError` code, which layer produces it, the copy it renders, and the sensible host reaction |

### `architecture/` - how the system works inside

| Doc | Covers |
|-----|--------|
| [mobile.md](architecture/mobile.md) | The React Native package: the state machine, the hardened WebView, permissions, token refresh, test doubles |
| [web.md](architecture/web.md) | The React web package: the origin-pinned iframe, the two web-specific machine rules, the mountable seam |
| [backend.md](architecture/backend.md) | `examples/full-service-demo`: the provider port, resolvers, webhook processing, the hosted page, observability |
| [integration.md](architecture/integration.md) | How the parts communicate: the seam, the bridge, GraphQL, webhooks, the shared error contract |
| [api-contracts.md](architecture/api-contracts.md) | The GraphQL schema and the three HTTP routes, field by field |
| [data-models.md](architecture/data-models.md) | The two Knex tables, their columns, the audit allow-list, the repository functions |
| [security.md](architecture/security.md) | The threat model: fail-closed boot, auth, webhook verification, the origin pin, CSP, PII discipline, host responsibilities |
| [source-tree.md](architecture/source-tree.md) | Annotated directory structure and the critical paths |

### Package and app READMEs

| Doc | Covers |
|-----|--------|
| [../packages/kyc-core/README.md](../packages/kyc-core/README.md) | The four entries, the bridge protocol, the error-code split, the state machine, the Sumsub mapping |
| [../packages/kyc-server/README.md](../packages/kyc-server/README.md) | The server package: minting tokens for the native SDK, the domain, the Knex store, the handlers and the router |
| [../packages/kyc-react-native/README.md](../packages/kyc-react-native/README.md) | The React Native package: modes, permission setup, `Verification` props, the hook, the native-SDK source and its test double |
| [../packages/kyc-react/README.md](../packages/kyc-react/README.md) | The web package: iframe/CSP requirements, origin pinning, `Verification` props |
| [../examples/full-service-demo/README.md](../examples/full-service-demo/README.md) | Running and configuring the reference backend |
| [../examples/react-native-demo/README.md](../examples/react-native-demo/README.md) | The four `KYC_MODE` modes, the screen/testID contract, the Maestro suite |
| [../examples/react-demo/README.md](../examples/react-demo/README.md) | The two web modes and the Playwright suites |

### Root

| Doc | Covers |
|-----|--------|
| [development-guide.md](./development-guide.md) | Working on this repo: setup, commands, quality gates, CI, and the first release |
| [releasing.md](./releasing.md) | How a merged PR becomes a version: release-please, the release PR, the changelog, what merging it does |
| [operations/live-e2e-ci.md](./operations/live-e2e-ci.md) | The opt-in live Sumsub job: the `sumsub-sandbox` environment, secrets, triggers, rotation, failure modes |
| [diagrams/](./diagrams/README.md) | All nine diagrams, pre-rendered (sources in `diagrams/src/`) |
| [superpowers/specs/2026-09-05-kyc-design.md](./superpowers/specs/2026-09-05-kyc-design.md) | The approved design this repo implements |

---

## Getting Started

### Quick start (development)

```bash
# 1. Install all workspaces (single root lockfile)
npm ci

# 2. Start the backend (dev Postgres + migrations + server on :4000)
make db-up migrate backend

# 3. Start a demo (new terminal, from the repo root)
make start && make ios      # React Native (or: make android)
make web                    # or the Vite demo on :5173
```

### Run tests

```bash
npm test                    # every workspace
make coverage               # 100% on the packages and examples/full-service-demo, 80% floor on the demos
make e2e-backend            # backend E2E, test DB lifecycle included
make e2e-web                # Playwright, hosted mode
make e2e-web-proxy          # Playwright, proxy mode
make e2e-android            # Maestro (see make help for prerequisites)
```

---

## Navigation by Use Case

### "I want to add identity verification to my app"
1. [Consuming the packages](integration/consuming.md) - registry setup and the minimal install
2. Pick a mode: [hosted](integration/hosted.md) (simplest), [native SDK](integration/native-sdk.md) (best mobile UX), [proxy](integration/proxy.md) (full orchestration)
3. Handle the failures: [error-codes.md](integration/error-codes.md)

### "I want to understand the codebase"
1. Start with the [README](../README.md) - the modes and the layout
2. [Source tree](architecture/source-tree.md), then [integration.md](architecture/integration.md) for how the parts talk
3. [diagrams/](./diagrams/README.md) for the same picture in eight pictures

### "I want to set up my dev environment"
1. [Development guide](./development-guide.md)

### "I want to understand the API"
1. [API contracts](architecture/api-contracts.md), then [data models](architecture/data-models.md)

### "I want to run this against real Sumsub"
1. [integration/sumsub.md](integration/sumsub.md) - dashboard setup, env wiring, and the manual device checklist

### "I want to review the security posture"
1. [architecture/security.md](architecture/security.md), then [SECURITY.md](../SECURITY.md) for reporting

### "I want to add a feature or a provider"
1. [Development guide](./development-guide.md) for the workflow and the quality gates
2. The architecture doc for the part you are touching - a new provider means implementing `VerificationProvider` ([backend.md](architecture/backend.md)) and, on the client, a `VerificationSource` ([integration.md](architecture/integration.md))

---

## Document Maintenance

This documentation is maintained by hand alongside code changes - update the
relevant doc in the same change. Diagram sources live in `diagrams/src/*.mmd`
and are rendered by `make diagrams`; CI fails if a source changes without its
SVG.
