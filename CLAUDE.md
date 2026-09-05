# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Identity verification (KYC) integration monorepo (npm workspaces). The
**backend service** is the main deliverable together with the **publishable
React Native and React web libraries**; the demo apps exist for manual and
E2E testing. **Status: bootstrap** — the packages build and publish and the
pipeline is green; the verification flow lands phase by phase (see
[the design](docs/superpowers/specs/2026-09-05-kyc-design.md)).

| Workspace | Path | Role |
|-----------|------|------|
| `backend` | `apps/api/` | Express 5 + Apollo Server 5 GraphQL API, Knex/PostgreSQL; `health` query + the `ErrorCode` wire contract today, provider adapters (Sumsub/mock) + webhooks + hosted page land in later phases |
| `@blinkbitcoin/kyc-core` | `packages/kyc-core/` | Platform-agnostic core: `VerificationSource` + capability guards, bridge protocol, `ErrorCode` contract (no React/DOM) |
| `@blinkbitcoin/kyc-sumsub` | `packages/kyc-sumsub/` | Sumsub adapters: shared mapping + `/react-native` + `/web` entries |
| `@blinkbitcoin/kyc-react-native` | `packages/kyc-react-native/` | Publishable RN library: `Verification` component + `useVerification` (hardened WebView for hosted mode) over core |
| `@blinkbitcoin/kyc-react` | `packages/kyc-react/` | Publishable React **web** library: `Verification` component + `useVerification` (iframe for hosted mode) over core |
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
`make diagrams` / `make docs-check`, `make e2e-backend` (DB up → migrate →
E2E → teardown), `make e2e-web` (Playwright), `make e2e-android` / `make
e2e-ios` (Maestro, needs a running stack; `make e2e-backend-up` starts the
mock-provider backend), `make db-up/migrate/backend`, `make ios/android/start/web`,
`make pods`, `make build`, `make release V=X.Y.Z`, `make clean/reset`. The
underlying npm scripts:

```bash
npm ci                       # Install all workspaces
npm test                     # All test suites: core + sumsub + RN + web libraries, both demos (Jest), backend (Vitest)
npm run test:coverage        # Coverage runs - 100% is the enforced baseline on packages + backend
npm run typecheck            # tsc across all workspaces
npm run lint                 # ESLint (mobile code) + Biome lint (backend)
npm run format               # Biome format (all workspaces)
npm run build                # Build the four libraries (bob for RN, tsup for core/sumsub/web)
npm run check:packages       # publint + arethetypeswrong on the built packages
npm run codegen               # Emit schema.graphql from typeDefs.ts + regenerate core's client types
npm start                    # Metro for the RN demo app
npm run ios / android        # Run the RN demo app
npm run web                  # Vite dev server for the web demo
npm run backend              # Backend dev server (tsx watch)
npm run test:e2e:backend     # Backend E2E (needs: docker compose -f docker-compose.test.yml up -d)
npm run test:e2e             # Maestro mobile E2E (needs backend + simulator/emulator)
```

Single test file: `npm test -w @blinkbitcoin/kyc-react-native -- packageInfo` or
`npm test -w apps/api -- tests/schema.test.ts`.

## Backend specifics

```bash
cd apps/api
npm run migrate              # Knex migrations (TS, run via tsx)
npm run migrate:test         # Same against the .env.test database
```

- Today the API exposes only `/health` and `/graphql` (a `health` query and
  the `ErrorCode` wire contract) - session creation, the Sumsub adapter,
  the webhook, and the hosted page land phase by phase (see
  [the design](docs/superpowers/specs/2026-09-05-kyc-design.md)).
- The wire contract is the `ErrorCode` enum in `apps/api/schema.graphql`
  (emitted from `src/typeDefs.ts`). After schema changes run `make codegen`;
  drift fails backend tests, client parity tests, and a CI step.
- Security is fail-closed by default: `validateSecurityConfig` (`src/config.ts`)
  refuses to boot without `JWT_SECRET` (and `SUMSUB_WEBHOOK_SECRET` when
  `KYC_PROVIDER=sumsub`) unless `ALLOW_INSECURE_DEV=true` is explicitly set.
  This is NOT gated on `NODE_ENV`.

## Library specifics

- Public API is `src/index.ts`. Each platform library re-exports
  `@blinkbitcoin/kyc-core` today; the `Verification` component +
  `useVerification` land with the RN/web phases.
- No URLs, tokens, or platform detection in the library - that's host-app
  (demo) wiring.
- **Provider-agnostic**: `Verification` takes a `VerificationSource` (not
  session/token details). The abstraction + capability guards
  (`isLaunchable`, `isTokenRefreshable`) live in `@blinkbitcoin/kyc-core`;
  Sumsub's sources live in `@blinkbitcoin/kyc-sumsub`. Add a provider = a
  new `VerificationSource`; the component never changes.
- The platform-agnostic code (the `VerificationSource` abstraction + guards,
  the bridge protocol, the `ErrorCode` contract + generated types) lives in
  **`@blinkbitcoin/kyc-core`** (`packages/kyc-core/`), depended on by the
  Sumsub, RN and web packages. Codegen runs in core
  (`packages/kyc-core/src/generated/`); never hand-edit or duplicate the
  generated types in another package.

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
- Shell that CI or the Makefile runs lives in `scripts/{ci,e2e,release}/`,
  never inline in a workflow; `make check-ci` runs actionlint + shellcheck
- `graphql` is pinned to 16.x repo-wide (Apollo Server 5's peer range) - do
  not bump it to 17 until Apollo Server supports it

## CI and releases

- One pipeline per branch (`ci.yml`): Checks (`checks.yml`: Changes, Code,
  Packages, Commits, Docs) → Unit (`test.yml`) → E2E (`e2e.yml`: Backend, Web,
  Build Android → Android, Build iOS → iOS) → Badges, then Publish → Verify on
  `main`. Docs-only PRs stop after Checks; `main` skips docs-only pushes.
- iOS E2E is opt-in (macOS runners bill at 10x): PR label `e2e:ios` or repo
  variable `E2E_IOS=true`; `E2E_IOS_RUNNER` overrides `runs-on`.
- Native E2E builds are cached on the inputs `scripts/native-deps-hash.sh`
  sees plus `android/**` / `ios/**`; bump the cache key's `v` suffix when an
  input the script cannot see changes.
- Releases: prerelease (`next`) on every green push to `main`; stable is
  `make release V=X.Y.Z` - the tag is the version, CI stamps it at publish
  time, `package.json` stays at `0.0.0-development`. Release notes come from
  PR titles (`.github/release.yml`). A release ships only once the commit's
  main run is green (`release-retry.yml` re-runs a blocked Publish).

## Architecture Patterns

- **Provider pattern**: the verification-mode boundary is
  `VerificationSource` (`packages/kyc-core/src/verification/types.ts`);
  Sumsub's sources live in `packages/kyc-sumsub/`. The equivalent backend
  provider port (`apps/api/src/providers/`) lands with the backend phase.
- **Safe Area**: `react-native-safe-area-context` (demo app concern)
- **Entry points**: `examples/react-native-demo/index.js` (RN app),
  `examples/react-demo/src/main.tsx` (web app), `apps/api/src/index.ts`
  (service bootstrap), `packages/kyc-{core,sumsub,react-native,react}/src/index.ts`
  (library APIs)
