# Project Documentation Index

**Project:** kyc
**Updated:** 2026-09-05

| Attribute | Value |
|-----------|-------|
| **Type** | Monorepo (npm workspaces): packages + service + demo apps |
| **Domain** | Fintech / identity verification (KYC) |
| **Primary Language** | TypeScript |
| **Architecture** | React / React Native packages + Express/Apollo reference backend |

## Documentation

| Doc | Covers |
|-----|--------|
| [development-guide.md](./development-guide.md) | Working on this repo: setup, commands, quality gates, CI |
| [diagrams/](./diagrams/README.md) | Rendered architecture diagrams (sources in `diagrams/src/`) |
| [superpowers/specs/2026-09-05-kyc-design.md](./superpowers/specs/2026-09-05-kyc-design.md) | The approved design this repo implements, phase by phase |
| [../packages/kyc-core/README.md](../packages/kyc-core/README.md) | The core package's three entries (`.`, `/hosted`, `/testing`), the bridge protocol and the error-code split |

`integration/` (consumer docs) and `architecture/` (internals) are written
with the phases that introduce them.

## Getting started

```bash
npm ci                         # install all workspaces (single root lockfile)
make db-up migrate backend     # dev Postgres + migrations + backend
make start && make ios         # RN demo (or: make android); make web for the web demo
npm test                       # everything; make e2e-backend / e2e-web / e2e-android for E2E
```

Documentation is maintained by hand alongside code changes — update the
relevant doc in the same change.
