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
│       │   ├── errors.ts            # ErrorCodes + ClientErrorCodes
│       │   ├── client.ts            # createKycApolloClient
│       │   ├── operations.ts        # The three GraphQL documents
│       │   └── generated/           # Codegen output from apps/api/schema.graphql
│       ├── codegen.ts
│       └── dist/                    # tsup output (gitignored)
│
├── 🪪 PROVIDER ADAPTERS - the only place Sumsub is named
│   │
│   └── packages/kyc-sumsub/
│       ├── src/
│       │   ├── index.ts             # `.` - pure mapping, no DOM, no native
│       │   ├── mapping.ts           # mapSumsubStatus, interpretSumsubWebMessage ⭐
│       │   ├── types.ts             # Sumsub's own vocabulary, nothing normalized
│       │   ├── provider.ts          # sumsubSession helper shared by the native source
│       │   ├── react-native.ts      # ./react-native entry
│       │   ├── web.ts               # ./web entry - reserved, no adapter in v1
│       │   └── native/
│       │       ├── sdk.ts           # SumsubSdkLike + the lazy require
│       │       └── source.ts        # createSumsubNativeSource ⭐
│       └── __mocks__/@sumsub/react-native-mobilesdk-module.ts
│
├── 📦 PLATFORM PACKAGES - THE PRODUCT
│   │
│   ├── packages/kyc-react-native/
│   │   ├── src/
│   │   │   ├── index.ts / hosted.ts # `.` and the Apollo-free ./hosted ⭐
│   │   │   ├── Verification.tsx     # One screen per state ⭐
│   │   │   ├── useVerification.ts   # The headless flow ⭐
│   │   │   ├── useTokenRefresh.ts
│   │   │   └── hosted/
│   │   │       ├── webViewProps.ts  # The hardening, as data ⭐
│   │   │       └── HostedWebView.tsx
│   │   ├── __mocks__/               # react-native-webview, netinfo
│   │   └── lib/                     # bob output (gitignored)
│   │
│   └── packages/kyc-react/
│       ├── src/
│       │   ├── index.ts             # Single entry ⭐
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
│       │   ├── verificationPages.ts # Hosted HTML + CSP + bridge script ⭐
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
    ├── scripts/{ci,e2e,release}/ , scripts/assemble-diagrams.mjs
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
