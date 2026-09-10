# Source Tree Analysis

**Project:** blinkbitcoin/kyc monorepo (npm workspaces)
**Updated:** 2026-09-06

## Repository Structure

```
kyc/
│
├── 🧩 SHARED CORE (platform-agnostic, no React, no DOM, no native)
│   │
│   └── packages/kyc-core/
│       ├── src/
│       │   ├── index.ts             # Full entry, incl. the Apollo pieces ⭐
│       │   ├── hosted.ts            # Apollo-free entry (./hosted) ⭐
│       │   ├── testing.ts           # ./testing - createFakeLaunchableSource
│       │   ├── verification/
│       │   │   ├── types.ts         # VerificationSource + capability guards ⭐
│       │   │   ├── machine.ts       # The shared state machine ⭐
│       │   │   ├── bridge.ts        # kyc-bridge envelopes + setToken transports
│       │   │   ├── messages.ts      # getErrorMessage copy
│       │   │   ├── labels.ts        # IdentityVerificationLabels + resolveLabelsWith, outcomeLabel, failureLabel
│       │   │   ├── hostedSource.ts  # createHostedSource (mode 1)
│       │   │   ├── proxySource.ts   # createProxySource (mode 3, Apollo)
│       │   │   └── fakeSource.ts    # Test double for the launch branch
│       │   ├── providers/sumsub/    # 🪪 The only Sumsub-aware code in core (entry ./sumsub)
│       │   │   ├── mapping.ts       # mapSumsubStatus, interpretSumsubWebMessage ⭐
│       │   │   ├── types.ts         # Sumsub's own vocabulary, nothing normalized
│       │   │   ├── session.ts       # sumsubSession helper shared by the native source
│       │   │   └── entry.ts         # The ./sumsub surface: index + the hosted layer
│       │   ├── sumsub.ts            # `./sumsub` - one-line re-export of providers/sumsub/entry
│       │   ├── errors.ts            # ErrorCodes + ClientErrorCodes
│       │   ├── client.ts            # createKycApolloClient
│       │   ├── operations.ts        # The three GraphQL documents
│       │   └── generated/           # Codegen output from examples/full-service-demo/schema.graphql
│       ├── codegen.ts
│       └── dist/                    # tsup output (gitignored)
│
├── 🖥️ SERVER PACKAGE - what a backend imports; the reference backend below is built on it
│   │
│   └── packages/kyc-server/
│       ├── src/
│       │   ├── index.ts             # `.` - the framework-free surface
│       │   ├── types.ts             # The domain vocabulary (statuses, platforms, provider results)
│       │   ├── provider.ts          # VerificationProvider port + HostedPageRenderer capability ⭐
│       │   ├── errors.ts            # KycError + ErrorCodes (the wire contract)
│       │   ├── signature.ts         # verifyHexDigest, the webhook-signature primitive
│       │   ├── http.ts              # HttpError + withRetry
│       │   ├── html.ts              # escapeHtml, sanitizeId, jsonForScript
│       │   ├── pages.ts             # The hosted page's neutral layer: params, CSP, not-found page
│       │   ├── bridge/script.ts     # The kyc-bridge script every page inlines
│       │   ├── audit.ts             # Audit vocabulary + metadata allow-list
│       │   ├── validation.ts        # Input rules (validateStartInput)
│       │   ├── auth.ts              # bearerToken
│       │   ├── log.ts               # Logger port + sanitizeForLog
│       │   ├── tracing.ts           # Tracing port + noopTracing
│       │   ├── sessions.ts          # createVerificationService; applyStatusTransition = the single write path ⭐
│       │   ├── store.ts             # SessionStore port + the in-memory store
│       │   ├── knex.ts / knex/{store,migrations}.ts   # `./knex` - the Knex store and the programmatic migration source ⭐
│       │   ├── graphql.ts           # typeDefs (the SDL) + createKycGraphQL ⭐
│       │   ├── handlers.ts          # Fetch handlers + the *Http decision functions
│       │   ├── express.ts           # `./express` - createKycRouter
│       │   ├── registry.ts          # providerFromEnv / defaultRegistry (KYC_PROVIDER) ⭐
│       │   ├── providers/mock/      # The deterministic provider + its page
│       │   ├── providers/sumsub/    # 🪪 config, client, provider, page (entry ./sumsub)
│       │   └── sumsub.ts            # `./sumsub` - one-line re-export of providers/sumsub
│       └── dist/                    # tsup output (gitignored)
│
├── 📦 PLATFORM PACKAGES - THE PRODUCT
│   │
│   ├── packages/kyc-react-native/
│   │   ├── src/
│   │   │   ├── index.ts / hosted.ts # `.` and the Apollo-free ./hosted ⭐
│   │   │   ├── theme.ts             # baseStyles (the StyleSheet), DEFAULT_LABELS, resolveStyles / resolveLabels
│   │   │   ├── sumsub.ts            # `./sumsub` - one-line re-export of providers/sumsub/entry
│   │   │   ├── IdentityVerification.tsx     # One screen per state ⭐
│   │   │   ├── useIdentityVerification.ts   # The headless flow ⭐
│   │   │   ├── useTokenRefresh.ts
│   │   │   └── hosted/
│   │   │       ├── webViewProps.ts  # The hardening, as data ⭐
│   │   │       └── HostedWebView.tsx
│   │   │   └── providers/sumsub/    # 🪪 The native-SDK source (entry ./sumsub)
│   │   │       ├── sdk.ts           # SumsubSdkLike + the lazy require of the optional peer
│   │   │       ├── source.ts        # createSumsubNativeSource ⭐
│   │   │       └── entry.ts         # The ./sumsub surface: core /sumsub + the component + the source
│   │   ├── __mocks__/               # react-native-webview, netinfo, @sumsub/react-native-mobilesdk-module (shipped)
│   │   └── lib/                     # bob output (gitignored)
│   │
│   └── packages/kyc-react/
│       ├── src/
│       │   ├── index.ts / hosted.ts # `.` and the Apollo-free ./hosted, the same contract as React Native's ⭐
│       │   ├── theme.ts             # baseStyles, DEFAULT_LABELS, resolveStyles / resolveLabels
│       │   ├── sumsub.ts            # `./sumsub` - reserved seat of the web-SDK adapter
│       │   ├── providers/sumsub/entry.ts
│       │   ├── IdentityVerification.tsx
│       │   ├── useIdentityVerification.ts
│       │   ├── useTokenRefresh.ts
│       │   ├── mountable.ts         # MountableSource seam
│       │   ├── MountPoint.tsx
│       │   └── hosted/
│       │       ├── frameProps.ts    # Attributes + origin guard, as data ⭐
│       │       └── HostedFrame.tsx
│       └── dist/                    # tsup output (gitignored)
│
├── 🖥️ REFERENCE BACKEND
│   │
│   └── examples/full-service-demo/
│       ├── src/
│       │   ├── app.ts               # helmet, CORS, rate limits, JWT, Apollo over createKycGraphQL, createKycRouter ⭐
│       │   ├── services.ts / store.ts / migrate.ts   # The service instance over the Knex store; runKycMigrations
│       │   ├── providers/
│       │   │   ├── index.ts         # The service's registry: package adapters + policy + tracing ⭐
│       │   │   ├── mock.ts          # assertMockProviderAllowed around the package's mock
│       │   │   └── sumsub/{index,config}.ts   # The package adapter wired to SUMSUB_* + validateConfig
│       │   ├── config.ts / auth.ts  # validateSecurityConfig, CORS origins, PUBLIC_BASE_URL; JWT
│       │   ├── tracing.ts / instrumentation.ts   # withSpan, instrumentProvider, the OTel bootstrap
│       │   ├── schema.ts / typeDefs.ts / errors.ts / types.ts   # Thin re-exports of the package
│       │   └── server.ts / index.ts # Boot (fail-closed) and the process entry
│       ├── scripts/                 # emit-schema.ts, sumsub-check.ts
│       ├── schema.graphql           # Emitted artifact - the wire contract ⭐
│       └── tests/ , tests/e2e/ , tests/live/   # unit (composition), real Postgres, real Sumsub sandbox (opt-in)
│
│   └── examples/access-token-demo/  # 🖥️ server shape 2: an existing GraphQL API adds one mint mutation (mode 2's backend)
│       └── src/{level,session,schema,server}.ts   # tier → level, one provider.createSession call
│
├── 🧪 DEMOS - executable integration docs and E2E hosts
│   │
│   ├── examples/react-native-demo/  # KYC_MODE native|hosted|proxy|fake-native, KYC_UI default|themed
│   │   ├── src/{config,apollo,source,theme}.ts   # The whole wiring a host writes (theme.ts: Blink's palette + Spanish copy) ⭐
│   │   ├── App.tsx
│   │   └── .maestro/                # 6 default flows + 2 fake-native-tagged
│   │
│   └── examples/react-demo/         # VITE_KYC_MODE hosted|proxy, VITE_KYC_UI default|themed
│       ├── src/{config,apollo,source,theme}.ts
│       ├── vite.config.ts           # libs from source when serving, dist when building
│       ├── vite/libraries.ts        # requireBuiltLibraries + sourceAliases, unit-tested ⭐
│       └── e2e/                     # Playwright: launch, hosted, proxy; ports.ts = the stack's ports from KYC_*_PORT ⭐
│
├── 📚 DOCS
│   └── docs/
│       ├── index.md                 # The map ⭐
│       ├── development-guide.md
│       ├── architecture/            # This directory (principles.md = the rules behind the layout)
│       ├── integration/             # Consumer guides
│       ├── operations/              # For whoever runs the GitHub settings (the live Sumsub job)
│       ├── diagrams/{src,dist}/     # .mmd sources → rendered SVGs
│       ├── assets/readme-hero.svg
│       └── superpowers/             # The approved design and the phase plans
│
└── 🔧 TOOLING
    ├── Makefile , packages/Makefile , examples/Makefile
    ├── scripts/                     # the `tooling` npm workspace; pure logic in scripts/lib/*.mjs, Vitest-covered at 100% ⭐
    │   ├── {ci,e2e}/ , assemble-diagrams.mjs , coverage-badge.mjs , status-badge.mjs
    │   ├── release/resolve-version.mjs  # thin CLI over scripts/lib/resolve-version.mjs
    │   ├── lib/*.mjs                # extracted, unit-tested logic behind the CLI entry scripts (semver, resolve-version, badge)
    │   └── __tests__/*.test.mjs     # shell-script tests (ci-scripts, maestro-bound, live-scripts) - shell out, not V8-covered
    ├── .github/workflows/           # ci → checks / test / e2e, then badges, publish, verify
    └── flake.nix , .envrc , lefthook.yml , biome.json , eslint.config.js
```

## Critical paths

### Core

- **The seam:** `src/verification/types.ts` - change `VerificationSource` or a capability guard and every mode is affected.
- **The protocol:** `src/verification/bridge.ts` - `BRIDGE_PROTOCOL_VERSION` is a compatibility contract with every deployed hosted page.
- **The machine:** `src/verification/machine.ts` - the one file both platform packages must agree on.
- **The Apollo boundary:** `src/hosted.ts` must never reach `proxySource.ts`. Guarded by `src/__tests__/hosted-entry.test.ts` and `scripts/pack-smoke.sh`.

### Platform packages

- `hosted/webViewProps.ts` and `hosted/frameProps.ts` are the security surface. Both are plain data with their own unit tests precisely so a regression is a failing assertion, not a field report.

### Backend

- `packages/kyc-server/src/provider.ts` - adding a provider means implementing this (plus, optionally, the two capabilities) under `providers/<name>/` and adding one registry entry; nothing else.
- `packages/kyc-server/src/sessions.ts` (`applyStatusTransition`) over `store.ts` / `knex/store.ts` (`updateSessionStatus`) - the terminal-state guard is part of the conditional `UPDATE` itself, the invariant that protects an approved user from a replayed callback; a guard test keeps the write path single.
- `examples/full-service-demo/schema.graphql` - the emitted wire contract; `make codegen` regenerates the client's view of it and `make codegen-check` fails on drift.

### Demos

- `examples/*/src/source.ts` - one `VerificationSource` per mode: the whole integration a host writes.
- `examples/*/src/theme.ts` - what a branded, multilingual host hands the component.
- `examples/react-demo/e2e/ports.ts` - the stack's ports (`KYC_API_PORT`, `KYC_WEB_PORT`, `KYC_WEB_PROXY_PORT`) every Playwright config and the backend's `PUBLIC_BASE_URL` / CORS come from.

## Integration points

| From | To | Mechanism |
|------|----|-----------|
| Host app | Platform package | `IdentityVerification` props |
| Platform package | Core | Direct import (exact-version dependency) |
| Core proxy source | `examples/full-service-demo` | GraphQL over HTTP with a Bearer token |
| Hosted page | Platform package | `kyc-bridge` envelopes over `postMessage` |
| Provider | `examples/full-service-demo` | Signed webhook |
| `examples/full-service-demo` | Sumsub | App-token-signed REST |
| `examples/full-service-demo` | PostgreSQL | Knex |
