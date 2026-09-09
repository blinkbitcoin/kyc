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
│       │   │   ├── hostedSource.ts  # createHostedSource (mode 2)
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
│       │   └── generated/           # Codegen output from apps/api/schema.graphql
│       ├── codegen.ts
│       └── dist/                    # tsup output (gitignored)
│
├── 🖥️ SERVER PACKAGE - being extracted from apps/api
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
│       │   └── tracing.ts           # Tracing port + noopTracing
│       └── dist/                    # tsup output (gitignored)
│
├── 📦 PLATFORM PACKAGES - THE PRODUCT
│   │
│   ├── packages/kyc-react-native/
│   │   ├── src/
│   │   │   ├── index.ts / hosted.ts # `.` and the Apollo-free ./hosted ⭐
│   │   │   ├── sumsub.ts            # `./sumsub` - one-line re-export of providers/sumsub/entry
│   │   │   ├── Verification.tsx     # One screen per state ⭐
│   │   │   ├── useVerification.ts   # The headless flow ⭐
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
│       │   ├── index.ts             # The root entry ⭐
│       │   ├── sumsub.ts            # `./sumsub` - reserved seat of the web-SDK adapter
│       │   ├── providers/sumsub/entry.ts
│       │   ├── Verification.tsx
│       │   ├── useVerification.ts
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
│   └── apps/api/
│       ├── src/
│       │   ├── app.ts               # Routes + middleware ⭐
│       │   ├── schema.ts            # Resolvers ⭐
│       │   ├── typeDefs.ts          # SDL, import-free
│       │   ├── providers/
│       │   │   ├── port.ts          # VerificationProvider ⭐
│       │   │   ├── mock.ts
│       │   │   └── sumsub/{index,client,config}.ts
│       │   ├── session.ts / audit.ts
│       │   ├── webhook.ts           # applyStatusTransition's caller; the terminal guard itself lives in session.ts ⭐
│       │   ├── verificationPages.ts # Hosted HTML + CSP; consumes the bridge ⭐
│       │   ├── hosted/bridgeScript.ts # The kyc-bridge page script, behaviour-tested ⭐
│       │   ├── config.ts / signature.ts / auth.ts
│       │   └── tracing.ts / instrumentation.ts
│       ├── migrations/              # Knex, TypeScript
│       ├── schema.graphql           # Emitted artifact - the wire contract ⭐
│       └── tests/ , tests/e2e/
│
├── 🧪 DEMOS - executable integration docs and E2E hosts
│   │
│   ├── examples/react-native-demo/  # KYC_MODE native|hosted|proxy|fake-native
│   │   ├── src/{config,apollo,source}.ts   # The whole wiring a host writes ⭐
│   │   ├── App.tsx
│   │   └── .maestro/                # 6 default flows + 2 fake-native-tagged
│   │
│   └── examples/react-demo/         # VITE_KYC_MODE hosted|proxy
│       ├── src/{config,apollo,source}.ts
│       ├── vite.config.ts           # libs from source when serving, dist when building
│       ├── vite/libraries.ts        # requireBuiltLibraries + sourceAliases, unit-tested ⭐
│       └── e2e/                     # Playwright: launch, hosted, proxy
│
├── 📚 DOCS
│   └── docs/
│       ├── index.md                 # The map ⭐
│       ├── development-guide.md
│       ├── architecture/            # This directory
│       ├── integration/             # Consumer guides
│       ├── diagrams/{src,dist}/     # .mmd sources → rendered SVGs
│       ├── assets/readme-hero.svg
│       └── superpowers/             # The approved design and the phase plans
│
└── 🔧 TOOLING
    ├── Makefile , packages/Makefile , apps/Makefile , examples/Makefile
    ├── scripts/                     # the `tooling` npm workspace; pure logic in scripts/lib/*.mjs, Vitest-covered at 100% ⭐
    │   ├── {ci,e2e}/ , assemble-diagrams.mjs , coverage-badge.mjs , status-badge.mjs
    │   ├── release/resolve-version.mjs  # thin CLI over scripts/lib/resolve-version.mjs
    │   ├── lib/*.mjs                # extracted, unit-tested logic behind the CLI entry scripts (semver, resolve-version, badge)
    │   └── __tests__/*.test.mjs     # shell-script tests (changed-class.sh, docs-freshness.sh) - shell out, not V8-covered
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

- `src/providers/port.ts` - adding a provider means implementing this and nothing else.
- `src/session.ts` (`applyStatusTransition` / `updateSessionStatus`) - the terminal-state guard is part of the conditional `UPDATE` itself, the invariant that protects an approved user from a replayed callback.
- `apps/api/schema.graphql` - the emitted wire contract; `make codegen` regenerates the client's view of it and `make codegen-check` fails on drift.

## Integration points

| From | To | Mechanism |
|------|----|-----------|
| Host app | Platform package | `Verification` props |
| Platform package | Core | Direct import (exact-version dependency) |
| Core proxy source | `apps/api` | GraphQL over HTTP with a Bearer token |
| Hosted page | Platform package | `kyc-bridge` envelopes over `postMessage` |
| Provider | `apps/api` | Signed webhook |
| `apps/api` | Sumsub | App-token-signed REST |
| `apps/api` | PostgreSQL | Knex |
