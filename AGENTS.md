# AGENTS.md

Instructions for AI agents working with this codebase.

## Project Overview

Identity verification (KYC) integration monorepo (npm workspaces): a backend
GraphQL service, a platform-agnostic core package, a Sumsub adapter package,
publishable React Native and React web libraries, and one demo app per
platform for manual and E2E testing. **Status: v1 complete** - all four
packages, the reference backend, both demos, the full E2E suite and the
documentation set are implemented. The design this repo followed is
[docs/superpowers/specs/2026-09-05-kyc-design.md](docs/superpowers/specs/2026-09-05-kyc-design.md);
the current state is [docs/index.md](docs/index.md).

- **Language**: TypeScript 6.0 everywhere
- **Node**: `^22.22.2 || >= 24.15.0`; toolchain pinned by `flake.nix`, entered
  via direnv (`direnv allow . && direnv allow examples/full-service-demo`, once per machine)
- **Docs**: `docs/index.md` is the current-state entry point; CLAUDE.md has
  the full command reference; `CONTRIBUTING.md` has the commit and release rules

## Project Structure

```
├── packages/
│   ├── kyc-server/              # 📦 server half: the verification-session domain over provider + store ports, Sumsub adapter, hosted page, Fetch handlers, /express router, /knex store (entries ., /express, /knex, /sumsub)
│   ├── kyc-core/                # 📦 platform-agnostic core: VerificationSource + guards, kyc-bridge protocol, hosted + proxy sources, Apollo factory, ErrorCode; providers/sumsub/ = the one Sumsub mapping (entry /sumsub)
│   ├── kyc-react-native/        # 📦 THE PRODUCT - RN (Verification + useVerification + hardened HostedWebView; entries ., /hosted and /sumsub = the native-SDK source in providers/sumsub/)
│   └── kyc-react/               # 📦 THE PRODUCT - web (Verification + useVerification + origin-pinned HostedFrame; entries ., /hosted (Apollo-free, same contract as RN) and /sumsub, the reserved web-SDK seat)
├── examples/
│   ├── full-service-demo/       # 🖥️ THE SERVICE (Express 5 + Apollo 5 + Knex/Postgres), composed from packages/kyc-server: this service's policy (helmet, CORS, rate limits, JWT auth, fail-closed boot) around the package's router, schema, store and adapters
│   │   └── src/
│   │       ├── providers/           # The registry: the package adapters wired to this service's config + tracing
│   │       ├── services.ts          # createVerificationService over the provider, the Knex store and PUBLIC_BASE_URL
│   │       ├── app.ts               # Apollo + the package router, under the service's middleware
│   │       └── config.ts            # validateSecurityConfig (fail-closed boot)
│   ├── access-token-demo/       # 🖥️ the other server shape: an existing GraphQL API adds one mutation that mints a provider access token (mode 1)
│   ├── react-native-demo/       # 📱 RN host: KYC_MODE native|hosted|proxy|fake-native, KYC_UI default|themed; Maestro suite (.maestro/)
│   └── react-demo/              # 🌐 Vite host: VITE_KYC_MODE hosted|proxy, VITE_KYC_UI default|themed; Playwright suites on per-worktree ports (e2e/)
├── docs/                        # Current-state documentation (hand-maintained): architecture/, integration/, diagrams/ (sources in src/*.mmd), index.md is the map
├── scripts/                     # the `tooling` npm workspace: ci/, e2e/, release/ shell + node used by the Makefile and CI; lib/*.mjs is Vitest-covered at 100%, __tests__/ covers the shell scripts
├── Makefile                     # Root flows; packages/, examples/ and each workspace have their own
└── package.json                 # Workspace root (orchestration scripts, single lockfile)
```

## Commands (repo root)

Prefer the Makefile (house convention): `make help` lists every target with a
one-line description. The ones you will reach for:

| Target | Description |
|--------|-------------|
| `make install` | `npm ci` across all workspaces (also installs the git hooks) |
| `make test` | Unit suites + `check-code` (lint, typecheck, format check) |
| `make coverage` | Coverage - 100% enforced on the packages, backend, and scripts/lib;<br>fails on a coverage row with nothing to cover (re-export / type-only<br>modules go in the workspace's exclude list) |
| `make check-ci` | actionlint on the workflows + shellcheck on `scripts/**` |
| `make codegen` | Regenerate `schema.graphql` + client types after editing the SDL in<br>`packages/kyc-server/src/graphql.ts` |
| `make diagrams` | Re-render `docs/diagrams/dist/*.svg` from `src/*.mmd` (CI fails on drift) |
| `make docs-check` | Warn when architecture-relevant changes ship without a `docs/` update;<br>fail on a README table cell line wider than 72 characters (break with `<br>`) |
| `make db-up migrate backend` | Dev Postgres, migrations, backend dev server |
| `make e2e-backend` / `make e2e-web` | Backend E2E against real Postgres / Playwright browser E2E (`e2e-web` builds the libraries first and bundles the demo against their dist) |
| `make start` / `make ios` / `make android` / `make web` | Demo apps |
| `make release` | Merge the open release PR that release-please maintains (tags, publishes; `docs/releasing.md`) |

Underlying npm scripts (`npm test`, `npm run typecheck`, `npm run lint`,
`npm run build`, ...) are listed in CLAUDE.md.

## Rules of the Road

- Do all branch work in a git worktree (`git worktree add ../kyc-<topic> -b <branch> origin/main`),
  never by switching branches in the main clone: several agent sessions share
  that checkout, and a commit made there lands on whatever branch another
  session left checked out
- Commit messages and PR titles are Conventional Commits with an allowed
  scope list (`core`, `server`, `rn`, `react`, `demo`, `e2e`, `ci`, `deps`,
  `deps-dev`, `docs`, `release`; source of truth `commitlint.config.mjs`).
  Squash merges take the PR title, so name the PR like a commit
- Change code **and the relevant doc in the same change**; `docs/` is
  hand-maintained and CI's Docs check flags architecture changes without one
  (a `package.json` counts only when the change is structural - exports,
  scripts, workspaces - not a dependency bump; Dependabot PRs are exempt)
- Shell that CI or the Makefile runs lives in `scripts/{ci,e2e,release}/`,
  not inline in workflows; it is shellcheck'd by `make check-ci`
- The provider boundary is `VerificationSource` (`packages/kyc-core/src/verification/types.ts`)
  on the client side and `VerificationProvider` (`packages/kyc-server/src/provider.ts`) on the
  server - nothing Sumsub-specific outside a `providers/sumsub/` directory:
  `packages/kyc-core/src/providers/sumsub/` (the one mapping),
  `packages/kyc-server/src/providers/sumsub/` (the adapter, its client and
  its hosted page), `packages/kyc-react-native/src/providers/sumsub/` (the
  native-SDK source), `packages/kyc-react/src/providers/sumsub/` (reserved)
  and `examples/full-service-demo/src/providers/sumsub/` (the package adapter wired to the
  service's config); a package's `src/sumsub.ts` is a one-line re-export of
  its `providers/sumsub/` surface (guard tests), generic layers never import
  a provider (guard tests), and hosts select one through `providerFromEnv`
  (`KYC_PROVIDER`)
- GraphQL error codes are a wire contract: the `ErrorCode` enum in
  `examples/full-service-demo/schema.graphql` (emitted from the SDL in
  `packages/kyc-server/src/graphql.ts`, re-exported by `src/typeDefs.ts`) and the generated
  client types in `packages/kyc-core/src/generated/` - run `make codegen`
  after schema changes; drift fails tests and a CI step. Client-only codes
  (`NETWORK_ERROR`, `PERMISSION_DENIED`, `SDK_UNAVAILABLE`, `TOKEN_EXPIRED`,
  `TOKEN_REFRESH_FAILED`, `BRIDGE_PROTOCOL`) live in `ClientErrorCodes` in
  `packages/kyc-core/src/errors.ts` and must never enter the schema enum
- `@blinkbitcoin/kyc-core` has four entries: `.` (needs the Apollo peers),
  `/hosted`, `/testing` and `/sumsub` (all Apollo-free, enforced by
  import-graph tests and by `scripts/pack-smoke.sh`)
- The libraries take no URLs/tokens/platform detection - host apps inject via
  a `VerificationSource` from `@blinkbitcoin/kyc-core` (the Sumsub native
  source comes from `@blinkbitcoin/kyc-react-native/sumsub`); demo wiring
  lives in `examples/*/src/`.
  `Verification` is provider-agnostic - adding a provider is a new
  `VerificationSource`, the component never changes
- The default UI renders nothing hard-coded: every string is a
  `VerificationLabels` key and every color a `VerificationTheme` key
  (`theme` / `styles` / `labels` props on `Verification`, resolved by
  core's `resolveLabelsWith` so both platforms agree); a host that needs
  a different layout calls `useVerification`
- `graphql` stays on 16.x repo-wide (Apollo Server 5 peer range)
- The git hooks (lefthook) run format, lint, commitlint and typecheck; CI is
  the authoritative gate and every workflow must be green before merge

## CI

One pipeline per branch (`ci.yml`): Checks → Unit → E2E (incl. the one build
of the packages, which Web tests) → Badges, then Publish (ships that build) +
Verify on `main`. Docs-only PRs stop after Checks. The iOS E2E
suite runs by default (GitHub-hosted macOS is free on a public repo); repo
variable `E2E_IOS=false` pauses it and PR label `e2e:ios` forces it for one PR
while paused. Native E2E builds are cached on the inputs
`scripts/native-deps-hash.sh` sees; bump the key's `v` suffix when an input it
cannot see changes.

## Testing

- Core / Sumsub / RN / web library tests: `packages/*/src/__tests__/`
- Demo tests: `examples/react-native-demo/{__tests__,src/__tests__}/`,
  `examples/react-demo/src/__tests__/`; browser E2E in `examples/react-demo/e2e/` (Playwright)
- Backend unit tests: `examples/full-service-demo/tests/` (DB mocked); E2E: `examples/full-service-demo/tests/e2e/`
  (real Postgres via `docker-compose.test.yml`)
- Tooling scripts: `scripts/lib/*.test.mjs` (100% Vitest coverage) for the
  extracted logic; `scripts/__tests__/*.test.mjs` shells out to the shell
  scripts themselves; CLI entry points are excluded from coverage by design
- Mobile E2E: Maestro flows in `examples/react-native-demo/.maestro/`, driven by `scripts/e2e/*`

## Troubleshooting

- **Metro cache**: `npm start -- --reset-cache`
- **Stale watchman** (after moving files): `watchman watch-del . && watchman watch-project .`
- **Clean Android build**: `cd examples/react-native-demo/android && ./gradlew clean`
- **Clean iOS build**: `cd examples/react-native-demo/ios && xcodebuild clean`
- **Reinstall deps**: `make reset` (root lockfile only)
