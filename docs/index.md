# Project Documentation Index

**Project:** kyc
**Updated:** 2026-09-06

| Attribute | Value |
|-----------|-------|
| **Type** | Monorepo (npm workspaces): packages + service + demo apps |
| **Domain** | Fintech / identity verification (KYC) |
| **Primary Language** | TypeScript |
| **Architecture** | React / React Native packages + an Express/Apollo backend serving `/health`, `/graphql` (`verificationSessionStart`, `verificationSessionRefresh`, `verificationSession`), `GET /hosted/:sessionId` and `POST /webhook/kyc/:provider` against a mock or Sumsub adapter |

## Documentation

| Doc | Covers |
|-----|--------|
| [development-guide.md](./development-guide.md) | Working on this repo: setup, commands, quality gates, CI |
| [diagrams/](./diagrams/README.md) | Rendered architecture diagrams (sources in `diagrams/src/`) |
| [../packages/kyc-sumsub/README.md](../packages/kyc-sumsub/README.md) | The Sumsub entries, the status table, and the manual sandbox checklist |
| [integration/sumsub.md](./integration/sumsub.md) | Wiring a Sumsub sandbox end to end: dashboard, env vars, and the manual device matrix |
| [superpowers/specs/2026-09-05-kyc-design.md](./superpowers/specs/2026-09-05-kyc-design.md) | The approved design this repo implements, phase by phase |
| [../packages/kyc-core/README.md](../packages/kyc-core/README.md) | The core package's three entries (`.`, `/hosted`, `/testing`), the bridge protocol and the error-code split |
| [../packages/kyc-react-native/README.md](../packages/kyc-react-native/README.md) | The React Native package: three modes, permission setup, `Verification` props, the `useVerification` hook |

The rest of `integration/` (consumer docs) and `architecture/` (internals)
are written with the phases that introduce them.

## Getting started

```bash
npm ci                         # install all workspaces (single root lockfile)
make db-up migrate backend     # dev Postgres + migrations + backend
make start && make ios         # RN demo (or: make android); make web for the web demo
npm test                       # everything; make e2e-backend / e2e-web / e2e-android for E2E
```

Documentation is maintained by hand alongside code changes — update the
relevant doc in the same change.
