# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Identity verification (KYC) integration monorepo (npm workspaces). The
**backend service** is the main deliverable together with the **publishable
React Native and React web libraries**; the demo apps exist for manual and
E2E testing. **Status:** v1 complete - core, the backend, the Sumsub adapters,
both platform packages, both demos, the full E2E suite (backend, Playwright,
Maestro) and the documentation set are in place. The repo is ready for its
first stable release (merge the release PR release-please opens, `make
release`, see [docs/releasing.md](docs/releasing.md)).

| Workspace | Path | Role |
|-----------|------|------|
| `backend` | `apps/api/` | Express 5 + Apollo Server 5 GraphQL API, Knex/PostgreSQL; verification session/token issuance, provider port (mock + Sumsub), signed webhooks and the hosted verification page |
| `@blinkbitcoin/kyc-core` | `packages/kyc-core/` | Platform-agnostic core: the shared verification state machine, `VerificationSource` + capability guards, `kyc-bridge` protocol, hosted + proxy sources, Apollo client factory, GraphQL operations, `ErrorCode` contract (no React/DOM); `providers/sumsub/` is the one Sumsub↔normalized mapping (used by `apps/api` too). Entries: `.`, `/hosted` (Apollo-free), `/testing` (fake source), `/sumsub` (Apollo-free, the mapping + the hosted layer) |
| `@blinkbitcoin/kyc-server` | `packages/kyc-server/` | Node-only server half: `createVerificationService` over the `VerificationProvider` + `SessionStore` ports, the Sumsub and mock adapters under `providers/`, the hosted page, Fetch handlers, the `/express` router, the `/knex` store with its migrations, `providerFromEnv` + `defaultRegistry`. A backend with its own API imports it; `apps/api` moves onto it next |
| `@blinkbitcoin/kyc-react-native` | `packages/kyc-react-native/` | Publishable RN library: `Verification` component + `useVerification` hook + `HostedWebView` (hardened WebView, camera capture granted, origin-pinned); `providers/sumsub/` = `createSumsubNativeSource` over the optional Mobile SDK peer. Entries: `.`, `/hosted` (Apollo-free), `/sumsub` (Apollo-free, the native source + the hosted surface) |
| `@blinkbitcoin/kyc-react` | `packages/kyc-react/` | Publishable React **web** library: `Verification` component + `useVerification` hook + `HostedFrame` (origin-pinned iframe, camera/microphone delegated) and the `MountableSource` seam; `providers/sumsub/` is the reserved seat of the web-SDK adapter (none in v1). Entries: `.`, `/sumsub` |
| `kyc-react-native-example` | `examples/react-native-demo/` | RN demo app hosting the RN library (Maestro E2E target) |
| `kyc-react-example` | `examples/react-demo/` | Vite web demo hosting the web library (`make web`) |

- **Language**: TypeScript everywhere (TS 6.0)
- **Node**: ^22.22.2 || >= 24.15.0 (floor set by jsdom 30)
- **Env management**: direnv (house convention) - `.envrc` at root (`use
  flake` + workspace bins on PATH) and in `apps/api/` (loads `.env`); the
  backend also self-loads `.env` via dotenv as a non-direnv fallback
- **Toolchain**: pinned by `flake.nix` (node 24, jdk 17, ruby 3.3, watchman);
  entered automatically via direnv, or `nix develop`. CI uses plain
  setup-node - the flake is convenience, not a hard requirement
- **Current-state docs**: `docs/index.md` - maintained by hand alongside code changes
- **Diagrams**: `docs/diagrams/README.md` and `docs/diagrams/dist/*.svg`
  are GENERATED - edit `docs/diagrams/src/*.mmd` and run `make diagrams`
  (renders SVGs via pinned mermaid-cli + reassembles the doc; a pre-commit
  hook does this automatically; CI fails on drift)

## Commands (repo root)

Makefiles exist at three levels: the root (repo-wide flows), the group dirs
(`apps/`, `packages/`, `examples/` - fan common targets out to auto-discovered
children), and each workspace (thin delegates to its npm scripts). So
`make -C packages coverage` runs all four libraries, `cd apps/api && make dev`
runs the service. `make help` lists every root target with a description.
The ones that matter most: `make test` (unit + check-code), `make coverage`,
`make check-ci` (actionlint + shellcheck of `scripts/**`), `make codegen`,
`make diagrams` / `make docs-check`, `make e2e-backend` (backend suite),
`make e2e-web` / `make e2e-web-proxy` (Playwright, hosted / proxy),
`make e2e-backend-up && make e2e-android` (Maestro, Android; iOS via `make
e2e-ios` or the `e2e:ios` label), `make e2e-fake-native` (native-launch
branch, needs a `KYC_MODE=fake-native` Metro), `make db-up/migrate/backend`, `make ios/android/start/web`,
`make pods`, `make build`, `make release`, `make clean/reset`. The
underlying npm scripts:

```bash
npm ci                       # Install all workspaces
npm test                     # All test suites: core + sumsub + RN + web libraries, both demos (Jest), backend + scripts (Vitest)
npm run test:coverage        # Coverage runs - 100% is the enforced baseline on packages + backend + scripts/lib
npm run typecheck            # tsc across all workspaces
npm run lint                 # ESLint (mobile code) + Biome lint (backend)
npm run format               # Biome format (all workspaces)
npm run build                # Build the four libraries (bob for RN, tsup for core/sumsub/web)
npm run check:packages       # publint + arethetypeswrong on the built packages (CI: E2E / Build Packages)
npm run codegen               # Emit schema.graphql from typeDefs.ts + regenerate core's client types
npm start                    # Metro for the RN demo app
npm run ios / android        # Run the RN demo app
npm run web                  # Vite dev server for the web demo
npm run backend              # Backend dev server (tsx watch)
npm run test:e2e:backend     # Backend E2E (needs: docker compose -f docker-compose.test.yml up -d)
npm run test:e2e             # Maestro mobile E2E (needs backend + simulator/emulator)
```

Single test file: `npm test -w @blinkbitcoin/kyc-react -- useVerification` or
`npm test -w apps/api -- tests/schema.test.ts`.

## Backend specifics

```bash
cd apps/api
npm run migrate              # Knex migrations (TS, run via tsx)
npm run migrate:test         # Same against the .env.test database
```

- The domain (authorization, validation, persist-first creation with its
  audit row, token refresh, reconciliation, the webhook state machine) is
  `createVerificationService` from `@blinkbitcoin/kyc-server`, composed in
  `src/services.ts`; the GraphQL layer (`src/schema.ts`) and the routes
  (the package router mounted in `src/app.ts`) only map inputs/outputs.
- DB access is the package's Knex `SessionStore` (`@blinkbitcoin/kyc-server/knex`),
  composed over the shared client in `src/store.ts`; the schema is the
  package's programmatic migration source (`src/migrate.ts` applies it, no
  migration files here). Never query inline in resolvers.
- The API exposes `/health`, `/graphql` (`verificationSessionStart`,
  `verificationSessionRefresh`, `verificationSession`), `GET
  /hosted/:sessionId` (the provider's page speaking the `kyc-bridge`
  protocol) and `POST /webhook/kyc/:provider` (signature-verified, the
  configured provider only). `KYC_PROVIDER` selects the adapter through the
  package's `providerFromEnv` over this service's registry
  (`src/providers/index.ts`): the package adapters wired to the service's
  config and policy, each wrapped in tracing.
- `approved` and `finallyRejected` are terminal: no webhook, replayed or
  late, may downgrade them. The guard is part of the store's conditional
  write, and `applyStatusTransition` on the service is the single write
  path for a status change (guard-tested in the package); a terminal
  session also stops minting tokens (hosted page 404,
  `verificationSessionRefresh` -> `VALIDATION_ERROR`).
- The api resolves `@blinkbitcoin/kyc-server` (and core's `/sumsub` and
  `/hosted` entries) from source for typecheck, tests and `tsx` dev
  (`tsconfig.json` paths + vitest aliases); `npm run build`
  (`tsconfig.build.json`) needs the packages' dist, so build them first
  (`npm run build` at the root).
- The wire contract is the `ErrorCode` enum in `apps/api/schema.graphql`
  (the SDL lives in `packages/kyc-server/src/graphql.ts`, re-exported by
  `src/typeDefs.ts`). After schema changes run `make codegen`; drift fails
  backend tests, client parity tests, and a CI step.
- Security is fail-closed by default: `validateSecurityConfig` (`src/config.ts`)
  refuses to boot without `JWT_SECRET` and an absolute `http(s)`
  `PUBLIC_BASE_URL` (and `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`,
  `SUMSUB_WEBHOOK_SECRET` when `KYC_PROVIDER=sumsub`) unless
  `ALLOW_INSECURE_DEV=true` is explicitly set - which is also what the
  forgeable `KYC_PROVIDER=mock` requires. This is NOT gated on `NODE_ENV`.

## Library specifics

- Public API is `src/index.ts`. Each platform library ships `Verification` +
  `useVerification` over its own embedding primitive (hardened WebView on RN,
  origin-pinned iframe on the web) and re-exports `@blinkbitcoin/kyc-core`.
  The state machine those hooks run is in core (`src/verification/machine.ts`)
  so the two platforms cannot drift; `HTMLElement` stays out of core, which
  is why `MountableSource` lives in `packages/kyc-react`. The consumer-facing
  documentation for all three modes is `docs/integration/` and the internals
  are `docs/architecture/` - change code and the matching doc in the same
  commit.
- No URLs, tokens, or platform detection in the library - that's host-app
  (demo) wiring.
- **Provider-agnostic**: `Verification` takes a `VerificationSource` (not
  session/token details). The abstraction + capability guards
  (`isLaunchable`, `isTokenRefreshable`) live in `@blinkbitcoin/kyc-core`;
  Sumsub's native source lives in `packages/kyc-react-native/src/providers/sumsub/`
  (`/sumsub` entry), its mapping in `packages/kyc-core/src/providers/sumsub/`.
  Add a provider = a new `VerificationSource`; the component never changes.
- The platform-agnostic code (the `VerificationSource` abstraction + guards,
  the `kyc-bridge` protocol, `createHostedSource` / `createProxySource`, the
  Apollo client factory, the `ErrorCode` contract + generated types) lives in
  **`@blinkbitcoin/kyc-core`** (`packages/kyc-core/`), depended on by the
  Sumsub, RN and web packages. Codegen runs in core
  (`packages/kyc-core/src/generated/`); never hand-edit or duplicate the
  generated types in another package.
- The demos are the executable integration docs: `examples/*/src/{config,apollo,source}.ts`
  is the whole wiring a host app writes, and the E2E suites drive it through
  the real mock provider page.

## iOS Setup (first time or after native dep changes)

```bash
cd examples/react-native-demo
bundle install
cd ios && bundle exec pod install
```

## Troubleshooting

```bash
npm start -- --reset-cache                            # Clear Metro cache
watchman watch-del . && watchman watch-project .      # Stale watchman after file moves
cd examples/react-native-demo/android && ./gradlew clean               # Clean Android build
cd examples/react-native-demo/ios && xcodebuild clean                  # Clean iOS build
rm -rf node_modules package-lock.json && npm install  # Full reinstall (root lockfile only)
```

## Code Style

- TypeScript for all new files; functional components with hooks
- Prefer `StyleSheet.create()` for styles
- ESLint 9 flat config (`@react-native` via FlatCompat) for mobile linting; Biome for formatting
- Do all branch work in a git worktree (`git worktree add ../kyc-<topic> -b <branch> origin/main`),
  never by switching branches in the main clone: several agent sessions share
  that checkout, and a commit made there lands on whatever branch another
  session left checked out
- Git hooks via lefthook (auto-installed by `npm install`): biome + eslint +
  diagram re-render on pre-commit, commitlint on commit-msg, typecheck on
  pre-push, `npm ci` on post-merge/post-checkout when the lockfile changed.
  Escape hatches: `git commit --no-verify`, `LEFTHOOK=0 git push`
- Commit messages and PR titles follow Conventional Commits with an allowed
  scope list: `core`, `sumsub`, `rn`, `react`, `api`, `demo`, `e2e`, `ci`,
  `deps`, `deps-dev`, `docs`, `release` (`commitlint.config.mjs` is the source
  of truth; e.g. `feat(rn): ...`, `fix(api): ...`, `ci(e2e): ...`, `docs: ...`).
  Squash merges take the PR title, so name the PR like a commit. Details in
  `CONTRIBUTING.md`
- Change code and the relevant `docs/` page in the same change; the CI Docs
  check (`make docs-check`) flags architecture-relevant diffs without one
  (a `package.json` counts only when the change is structural - exports,
  scripts, workspaces - not a dependency bump; Dependabot PRs are exempt)
- **README tables**: GitHub sizes columns by content, so one long cell
  squeezes the first column until `make coverage-badge` wraps word by word.
  Every table cell line stays at or under 72 visible characters, broken with
  `<br>`; `make docs-check` (`scripts/ci/docs-tables.mjs`) fails otherwise -
  the rule is enforced, not remembered.
- **Coverage rows with nothing to cover**: a re-export barrel or type-only
  module shows as 0% without lowering the totals. Exclude it in the
  workspace's coverage config; `make coverage` (`scripts/ci/coverage-empty.mjs`)
  fails on any such row.
- Shell that CI or the Makefile runs lives in `scripts/{ci,e2e,release}/`,
  never inline in a workflow; `make check-ci` runs actionlint + shellcheck
- `graphql` is pinned to 16.x repo-wide (Apollo Server 5's peer range) - do
  not bump it to 17 until Apollo Server supports it
- **Sumsub semantics live in one place.** `packages/kyc-core/src/providers/sumsub/mapping.ts` is the only implementation of the Sumsub status/webhook/event tables. `apps/api` imports it (`@blinkbitcoin/kyc-core/sumsub`) and the hosted page embeds a JSON table *generated* from `mapSumsubStatus` at render time — never a second hand-written copy.
- **Provider boundary, everywhere.** Nothing Sumsub-specific outside a `providers/sumsub/` directory - in core (the mapping), the RN package (the native-SDK source), the web package (reserved) and `apps/api`. Generic layers never import a provider and each package's `src/sumsub.ts` is a one-line re-export of its `providers/sumsub/` surface; guard tests enforce both.
- **`apps/api` is composition only.** `src/{services,store,migrate,schema,typeDefs,errors,types}.ts` and `src/providers/*` are a few lines each over `@blinkbitcoin/kyc-server`; the rules live in the package and are tested there. The service resolves the package from source (tsconfig paths, vitest aliases, tsx), so `npm run backend`, `scripts/e2e/backend-up.sh` and Playwright's `webServer` need no build; only `npm run build` does.

## CI and releases

- One pipeline per branch (`ci.yml`): Checks (`checks.yml`: Changes, Code,
  Commits, Docs - all static) → Unit (`test.yml`) → E2E (`e2e.yml`: Build
  Packages → Web, Backend, Build Android → Android, Build iOS → iOS) → Badges,
  then Publish → Verify on `main`. Build Packages is the one build of the
  libraries: Web bundles the demo against its dist and Publish ships its
  tarballs unchanged. Docs-only PRs stop after Checks; `main` skips docs-only
  pushes.
- iOS E2E runs by default (public repo: GitHub-hosted macOS is free). Pause it
  with repo variable `E2E_IOS=false`; PR label `e2e:ios` forces it for one PR
  while paused; `E2E_IOS_RUNNER` overrides `runs-on`.
- Native E2E builds are cached on the inputs `scripts/native-deps-hash.sh`
  sees plus `android/**` / `ios/**`; bump the cache key's `v` suffix when an
  input the script cannot see changes.
- Releases: prerelease (`next`) on every green push to `main`; stable is
  merging the `chore(release): X.Y.Z` PR that release-please opens once a
  feat/fix lands (`make release`). That tags `vX.Y.Z`, writes the GitHub
  Release from `CHANGELOG.md`, and dispatches `ci.yml` at the tag - the tag
  is the version, CI stamps it before building the packages, the four
  publishable `package.json` files stay at `0.0.0-development`. Never
  hand-edit `CHANGELOG.md` or the root `package.json` version. A release
  ships only once the commit's main run is green (`release.yml`'s retry
  job re-runs a blocked Publish). `docs/releasing.md`.

## Architecture Patterns

- **Provider pattern**: the verification-mode boundary is
  `VerificationSource` (`packages/kyc-core/src/verification/types.ts`);
  Sumsub's client code sits under `providers/sumsub/` in core (the mapping)
  and the RN package (the native source), reached through the `/sumsub`
  entries. The server's equivalent
  is `VerificationProvider` (`packages/kyc-server/src/provider.ts`) with the
  mock and Sumsub adapters under `packages/kyc-server/src/providers/`; the
  optional `getStatusByUserId` and `hostedPage` capabilities are detected
  with `supportsUserStatusLookup` / `supportsHostedPage`. A new provider is
  an adapter directory under `providers/<name>/` (server: the port, its
  page; core/RN: the mapping, the source) plus one registry entry; hosts
  select it with `KYC_PROVIDER=<name>`.
- **Safe Area**: `react-native-safe-area-context` (demo app concern)
- **Entry points**: `examples/react-native-demo/index.js` (RN app),
  `examples/react-demo/src/main.tsx` (web app), `apps/api/src/index.ts`
  (service bootstrap), `packages/kyc-{core,sumsub,react-native,react}/src/index.ts`
  (library APIs)
