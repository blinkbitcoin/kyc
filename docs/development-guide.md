# Development Guide

**Project:** kyc
**Updated:** 2026-09-06

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | ^22.22.2 or ≥24.15 | Runtime (floor set by jsdom 30) |
| npm | Latest | Package management |
| Docker | Latest | Test database |
| Xcode | Latest | iOS builds (macOS only) |
| Android Studio | Latest | Android builds |
| Ruby | 3.2+ | CocoaPods (iOS) |
| direnv | Latest | Env management (house convention) - `brew install direnv` + shell hook |
| Nix (flakes) | Latest | Toolchain pinning via `flake.nix` (node 24, jdk 17, ruby 3.3, watchman) - loaded by direnv's `use flake` |

- Sumsub sandbox credentials are only needed for the manual checklist in
  [integration/sumsub.md](integration/sumsub.md). Nothing in `npm test`,
  `make coverage` or any E2E suite talks to Sumsub.

## Initial Setup

### 1. Clone and Install

```bash
# Clone repository
git clone <repository-url>
cd kyc

# Install all workspaces (library, demo app, backend - single root lockfile)
npm ci

# Enable direnv (once per machine) - loads .env files, enters the nix
# flake dev shell (pinned node/jdk/ruby/watchman), and puts workspace
# bins (tsx, knex, biome, ...) on PATH
direnv allow . && direnv allow examples/full-service-demo
```

Without direnv/nix, any Node 22.22+ or 24.15+ plus a JDK 17 and Ruby 3.2+ works -
the flake is the convenient, pinned path, not a hard requirement (CI uses
plain setup-node).

### 2. iOS Setup (macOS only)

```bash
cd examples/react-native-demo
bundle install                     # Ruby deps (CocoaPods)
cd ios && bundle exec pod install  # iOS native deps
```

### 3. Backend Database Setup

```bash
# Start development database
cd examples/full-service-demo
docker-compose up -d

# Run migrations
npm run migrate
```

### 4. Environment Configuration

Environment is managed with **direnv** (house convention): `.envrc` files load
`.env`/`.env.local` when you `cd` in. The backend also self-loads `.env` via
`dotenv/config` as a fallback for non-direnv environments (CI, IDE launchers) -
dotenv never overrides direnv-exported values, so precedence is consistent.

**Backend (`examples/full-service-demo/.env`, see `examples/full-service-demo/.env.example`):**
```env
DATABASE_URL=postgresql://dev:dev@localhost:5432/kyc
KYC_PROVIDER=mock            # 'sumsub' for the real integration
PORT=5100

# Required when KYC_PROVIDER=sumsub (server fails fast if missing)
# SUMSUB_APP_TOKEN=<app token>
# SUMSUB_SECRET_KEY=<secret key>
# SUMSUB_WEBHOOK_SECRET=<webhook secret key>
# SUMSUB_BASE_URL=https://api.sumsub.com

# Fail-closed in production when unset; optional in dev
# JWT_SECRET=your-jwt-secret
```

## Running the Application

### Start Backend

```bash
cd examples/full-service-demo
npm run dev
# Server runs at http://localhost:5100
# GraphQL Playground at http://localhost:5100/graphql
```

### Start Mobile (Metro)

```bash
# In project root
npm start
```

### Run on Device/Simulator

```bash
# iOS
npm run ios

# Android
npm run android
```

## Development Commands

A `Makefile` at the repo root wraps all common flows (house convention) -
run `make help` for the list. Highlights: `make test` (unit + check-code),
`make e2e-backend` (full DB lifecycle), `make db-up migrate backend`.

Git hooks (lefthook, auto-installed by `npm install` via the `prepare`
script): pre-commit formats + lints staged files (Biome, auto-fixes are
re-staged; ESLint on TS/TSX), commit-msg enforces Conventional Commits
(commitlint), pre-push runs the workspace typecheck, and post-merge /
post-checkout re-run `npm ci` when the lockfile changed. Skip once with
`git commit --no-verify`; CI remains the authoritative gate. Commit message
format, scopes, and PR conventions: [CONTRIBUTING.md](../CONTRIBUTING.md).

The npm scripts underneath:

### Root orchestration (npm workspaces)

| Command | Description |
|---------|-------------|
| `npm test` | All suites: library + demo + backend |
| `npm run typecheck` | tsc across all workspaces |
| `npm run build` | Build the library (react-native-builder-bob) |

### Demo app / library

| Command | Description |
|---------|-------------|
| `npm start` | Start Metro bundler (demo) |
| `npm run ios` | Run on iOS simulator |
| `npm run android` | Run on Android emulator |
| `npm test` | Run Jest tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Biome |

### Backend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run production build |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run migrate` | Run Knex migrations |
| `npm run lint` | Run Biome lint |
| `npm run format` | Format with Biome |

## Testing

**Unit and E2E suites are hermetic and mock-only by design.** They run against
`KYC_PROVIDER=mock` and a real (or dockerized) Postgres, never against Sumsub.
Setting `SUMSUB_*` variables does not - and must not - point these suites at
the real provider: that happens only through the manual runs described in
[integration/sumsub.md](integration/sumsub.md).

### Mobile Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- Verification.test.tsx

# Watch mode
npm test -- --watch
```

### Backend Unit Tests

```bash
cd examples/full-service-demo

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Tooling Scripts

The CI/release logic under `scripts/` is its own `tooling` npm workspace
(`npm run test -w scripts`, `npm run test:coverage -w scripts`). Pure logic
lives in `scripts/lib/*.mjs` (semver parsing, version resolution, badge
rendering) and is covered by Vitest at the same 100% bar as the publishable
packages and the backend; the CLI entry points that wrap it
(`scripts/release/resolve-version.mjs`, `scripts/coverage-badge.mjs`,
`scripts/status-badge.mjs`) are thin argv/env/git/fs wrappers and stay
excluded from that coverage measurement by design. Shell scripts
(`scripts/ci/changed-class.sh`, `scripts/ci/docs-freshness.sh`, ...) are
exercised separately in `scripts/__tests__/*.test.mjs`, which shell out to
the real script under a temp git repo/fixture rather than being covered by
V8 instrumentation.

### Backend E2E Tests

```bash
# Start test database
docker-compose -f docker-compose.test.yml up -d

# Wait for database
docker-compose -f docker-compose.test.yml exec -T postgres-test pg_isready -U test -d kyc_test

# Run migrations
npm run migrate:test

# Run E2E tests
npm run test:e2e

# Cleanup
docker-compose -f docker-compose.test.yml down
```

### Web E2E Tests (Playwright)

```bash
npx playwright install chromium     # once per machine
make e2e-web                        # hosted mode - what CI runs
make e2e-web-proxy                  # proxy mode
KYC_API_PORT=5110 KYC_WEB_PORT=5111 KYC_WEB_PROXY_PORT=5112 make e2e-web   # a second worktree
```

Both targets bring up the dockerized test Postgres, migrate it, and let
Playwright start the backend and Vite. Every service runs on a custom port
(`examples/react-demo/e2e/ports.ts` reads `KYC_API_PORT`, `KYC_WEB_PORT`,
`KYC_WEB_PROXY_PORT`; 5100 / 5101 / 5102 by default), so a second repo or
worktree sets three variables and never adopts this one's servers; the
backend is told its port, the public base URL to mint on and the demo
origins to allow. The app and the hosted page are genuinely cross-origin
(the Vite port vs the backend port), so the suites exercise the real
`postMessage` path and the origin pin rather than a same-origin shortcut.

### Live Sumsub (opt-in)

```bash
make sumsub-env APP_TOKEN=… SECRET_KEY=… WEBHOOK_SECRET=…   # writes examples/full-service-demo/.env
make sumsub-check                                            # credentials + level, in one call
make e2e-live                                                # the whole live run against the sandbox API
```

Skipped without credentials, never part of `make test`; in CI it is the
opt-in `Live Sumsub` job (`docs/operations/live-e2e-ci.md`). The device
matrix (`docs/integration/sumsub.md`, sections 3-5) is manual.

### Mobile E2E Tests (Maestro)

```bash
# Install Maestro once
curl -Ls "https://get.maestro.mobile.dev" | bash

# Android, in one command (an emulator must already be running):
emulator -avd <avd> &
make e2e-android-local     # test DB + backend + debug APK + Metro (hosted) + Maestro, then teardown

# ...or step by step, which is what CI's jobs do:
make e2e-backend-up        # E2E Postgres, migrations, the backend on KYC_API_PORT
make android-build         # debug APK for the emulator's ABI
make e2e-metro-up          # Metro in hosted mode, bundle prewarmed
make e2e-android
make e2e-metro-down && make e2e-backend-down

# iOS, in one command (boots the first iPhone simulator if none is booted):
make e2e-ios-local         # test DB + backend + pods if missing + .app + install + Metro + Maestro
```

Six flows run by default (`app-launch`, `hosted-happy-path`, `hosted-decline`,
`hosted-cancel`, `hosted-token-refresh`, `hosted-error-retry`). Two more are
tagged `fake-native` and excluded from the default run because they need their
own Metro - which is why the CI-invoked script names never change:

```bash
#   in another terminal: KYC_MODE=fake-native npm start
make e2e-fake-native      # no backend needed
```

`make e2e-ios` runs the same default suite on a booted simulator with the app
installed. The Android runner does `adb reverse tcp:$KYC_API_PORT tcp:$KYC_API_PORT`
(`scripts/e2e/android-maestro.sh`), which is what makes the backend's
`http://localhost:<port>/hosted/<id>` load inside the emulator's WebView.

## Code Style

### TypeScript
- Strict mode enabled
- Prefer interfaces over types
- Explicit return types on functions

### React Native
- Functional components with hooks
- `StyleSheet.create()` for styles
- Safe area handling via `useSafeAreaInsets()`

### Backend
- Express 5 async error handling
- GraphQL error codes for client handling
- Audit logging for all state changes

### Formatting
```bash
# Check formatting
npm run format:check

# Fix formatting
npm run format
```

### Linting
```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

## Database Operations

### Knex Commands

```bash
cd examples/full-service-demo

# Create migration
npx tsx "$(command -v knex)" migrate:make -x ts <migration-name>

# Apply migrations
npm run migrate

# Roll back the last migration batch
npx tsx "$(command -v knex)" migrate:rollback

# Check migration status
npx tsx "$(command -v knex)" migrate:status
```

> Migrations are TypeScript files, and the `knex` CLI can't load `.ts`
> config/migration files on its own — run it through `tsx` (resolving the CLI
> via `command -v knex`, since bins hoist to the workspace root), or use the
> `npm run migrate` script for the common `migrate:latest` case.

## Troubleshooting

### Metro Cache Issues
```bash
npm start -- --reset-cache
```

### iOS Build Issues
```bash
cd examples/react-native-demo/ios
xcodebuild clean
rm -rf Pods Podfile.lock
bundle exec pod install
```

### Android Build Issues
```bash
cd examples/react-native-demo/android
./gradlew clean
```

### Node Modules Issues
```bash
rm -rf node_modules package-lock.json
npm install
```

### Migration Issues
```bash
cd examples/full-service-demo
npx tsx "$(command -v knex)" migrate:status
npm run migrate
```

## Environment Variables Reference

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `ALLOW_INSECURE_DEV` | no | Explicit opt-in to run without JWT/webhook secrets (never in prod) |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated CORS allow-list |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Prod | HS256 JWT verification secret. Unset: dev treats bearer token as userId; production treats requests as unauthenticated (fail-closed) |
| `KYC_PROVIDER` | No | Provider selection: `mock` (default) or `sumsub` |
| `MOCK_WEBHOOK_SECRET` | no | Secret the mock provider signs its own webhooks with, default `mock` |
| `NODE_ENV` | no | `production` activates the fail-closed auth/webhook behavior described above |
| `OTEL_*` | no | Standard OpenTelemetry vars; tracing is off unless set (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_EXPORTER=console` for stdout) |
| `PORT` | No | Server port (default: 5100). The E2E scripts and the demos find the backend through `KYC_API_PORT` (same default); the web demo listens on `KYC_WEB_PORT` (5101), its proxy build on `KYC_WEB_PROXY_PORT` (5102), the access-token example on its own `PORT` (5103) |
| `PUBLIC_BASE_URL` | Prod | Absolute http(s) base the hosted-page url and the mock webhook target are built from; required unless `ALLOW_INSECURE_DEV=true`, default `http://localhost:5100` in insecure dev |
| `SUMSUB_APP_TOKEN` | sumsub | Sumsub app token |
| `SUMSUB_BASE_URL` | no | Sumsub API base (defaults to `https://api.sumsub.com`) |
| `SUMSUB_LEVEL_NAME` | no | Verification level requested when the client does not send one, default `basic-kyc-level` |
| `SUMSUB_SECRET_KEY` | sumsub | Sumsub secret key |
| `SUMSUB_TOKEN_TTL_SECS` | no | Access-token lifetime in seconds, default `600` |
| `SUMSUB_WEBHOOK_SECRET` | sumsub | Webhook signature validation secret |

The `sumsub` column means required when `KYC_PROVIDER=sumsub` - the server
refuses to start without them unless `ALLOW_INSECURE_DEV=true`. The full
control set, and what each one is defending against, is in
[architecture/security.md](architecture/security.md).

### Mobile / web demos (bundle-time)

| Variable | App | Description |
|----------|-----|-------------|
| `KYC_MODE` | React Native demo (Metro) | `native` (default) / `hosted` / `proxy` / `fake-native` - inlined at bundle time, see `examples/react-native-demo/src/config.ts` |
| `VITE_KYC_MODE` | Web demo (Vite) | `hosted` (default) / `proxy`, see `examples/react-demo/src/config.ts` |

Both demos resolve the backend origin themselves (Android emulators reach the
host machine via `10.0.2.2`, iOS simulators via `localhost`); the RN and web
`Verification`/`useVerification` packages take a session/token source from
the host app rather than owning a GraphQL client directly.

## Documentation

Docs are hand-maintained and live beside the code they describe. The map is
[index.md](./index.md).

```bash
make docs-check       # warns on architecture changes without a docs/ update
make diagrams         # renders docs/diagrams/dist/*.svg and reassembles the page
make diagrams-check   # fails if the combined page is stale
```

Diagram sources are `docs/diagrams/src/*.mmd` and are canonical; the SVGs and
`docs/diagrams/README.md` are generated. Adding a diagram means a new `.mmd`,
an entry in `scripts/assemble-diagrams.mjs`'s `SECTIONS`, and a row in
`.claude/skills/regenerate-mermaid-diagrams/SKILL.md`. Changing a source
without committing its re-rendered SVG is a **hard CI failure**, not a warning.

Keep labels free of bare `;` - mermaid parses it as a statement separator and
mermaid-cli rejects it even where GitHub's renderer is lenient.

## CI/CD

### GitHub Actions Workflows

One workflow file per event source, named after what runs. GitHub draws one
graph per run; the whole pipeline with its cross-workflow edges is one
diagram: [CI / Release Pipeline](diagrams/README.md#ci--release-pipeline).

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push to main, PRs, release tag (dispatched by `release.yml`, or a hand-cut GitHub Release), manual | The one pipeline every branch runs, staged so a failure never spends the next stage's minutes: `Checks` (calls `checks.yml`) → `Unit` (calls `test.yml`) → `E2E` (calls `e2e.yml`; its `Build Packages` job is the one build of the packages), then `Badges` (coverage + Unit / E2E pass-fail badges for the branch to `gh-pages/badges/<branch>/`, after E2E so it never delays it), and on main pushes / releases / dispatch `Publish` (ships the tarballs `Build Packages` made and `Web` tested to GitHub Packages, nothing is rebuilt: release → stable `latest`, version = the tag; main → prerelease `next`) + `Verify` (installs the published packages from GitHub Packages into a clean project and asserts the consumer contract). Workflow badge, if needed: `ci.yml/badge.svg?branch=<branch>` |
| `checks.yml` | `workflow_call` only | First stage, all static: `Changes` (classifies the PR: when every changed file is docs/, `*.md`, `LICENSE` or a template, Unit and E2E are skipped; main pushes get the same via `paths-ignore`), `Code` (audit-ci, actionlint, diagram freshness, `make check-code` = lint + typecheck + format), `Commits` (Conventional Commits on the PR's commits and title; PRs only), `Docs` (warns when architecture-relevant files change without a docs/ update; fails for a diagram source without its SVG) |
| `test.yml` | `workflow_call` only | Unit tests + coverage thresholds; uploads the coverage badge (1 day, consumed by `Badges`) and the combined HTML coverage report (`coverage-report` artifact, 30 days) |
| `e2e.yml` | `workflow_call` only | `build-packages` (version stamp, build, publint + arethetypeswrong, pack smoke; uploads the dist for `web` and the tarballs for `Publish`) plus the E2E suites as jobs: `backend`, `web` (Playwright, bundles the demo against that dist - what a web consumer installs), `build-android` → `android` (emulator), and `build-ios` → `ios` (simulator) **on by default** (see below). Outputs the stamped `version` / `disttag` for `Publish` |
| `release.yml` | Push to main; CI completed on main | `Release PR / Tag` (push): keeps the `chore(release): X.Y.Z` PR current (version from the Conventional Commits since the last tag, `CHANGELOG.md` entry); when that PR merges, tags `vX.Y.Z`, creates the GitHub Release and dispatches `ci.yml` at the tag with `release_tag` (a release the workflow token creates never fires the `release:` trigger). `Re-run blocked releases` (CI completed green): re-runs the failed Publish of any release run for that commit (releases wait for / refuse a red main run). See [releasing.md](releasing.md) |
| `pull-request.yml` | PR closed; PR title edited | `Cancel in-flight runs` + `Remove branch badge` (closed): cancels the PR's still-running runs (the push-to-main run is unaffected) and removes its `gh-pages` badge directory. `Title` (edited): re-lints the PR title only; the gating lint is the `Commits` job in `checks.yml` (a title edit must not re-run the whole pipeline) |
| `codeql.yml` | Push to main, PRs (both ignore docs-only changes), weekly schedule | CodeQL static analysis (JavaScript/TypeScript); alerts land under Security → Code scanning;<br>suite + query filters in `.github/codeql/codeql-config.yml` |

Badges are per branch by construction: `gh-pages/badges/X/{unit,e2e,coverage}.svg`
(and a workflow badge filtered with `?branch=X`) all describe branch `X`
and nothing else. The README shows `main`.

### iOS E2E and the macOS runner

The iOS job runs on every run. It needs a macOS runner, which GitHub hosts for
free on a public repo; on a private repo macOS bills at 10x Linux (one ~15 min
run is ~150 Linux minutes), which is why the job was opt-in before the repo
went public. `ci.yml` passes `ios: true` to `e2e.yml` unless one of these says
otherwise; a skipped job costs nothing and the `E2E` badge describes what
actually ran.

| Switch | Effect |
|--------|--------|
| Repo variable `E2E_IOS=false` | Pauses iOS on every run (`gh variable set E2E_IOS --body false`; delete the variable to resume). |
| PR label `e2e:ios` | Forces iOS for that PR while paused (labeling triggers a run). |
| Repo variable `E2E_IOS_RUNNER` | `runs-on` for the iOS job, default `macos-latest`. Set to self-hosted label(s), e.g. `["self-hosted","macOS","arm64"]`, and GitHub-hosted macOS is never used. |

All workflows run with `permissions: contents: read` (the publish job adds
`packages: write`; the Badges and closed-PR cleanup jobs get
`contents: write` for the ruleset-exempt `gh-pages` branch only), have
timeouts, and cancel superseded runs per ref (never a running `main` run).
`checks.yml` also runs **actionlint** over the workflow files themselves;
`.github/dependabot.yml` keeps the action versions current.

### Running CI Locally

The workflows are thin: triggers, `needs`, caches and one-line `run:` steps.
The logic lives in `scripts/ci/` (runner plumbing), `scripts/e2e/` (the E2E
stack) and `scripts/release/` (publish), exposed through `make` wherever a
human would run it - so a CI failure can be reproduced without pushing:

```bash
# The whole Checks stage (static only)
make check-code check-ci codegen-check diagrams-check docs-check

# Unit
make coverage

# E2E
make build && npm run check:packages && bash scripts/pack-smoke.sh   # Build Packages
make e2e-backend        # Backend
make e2e-web            # Web (Playwright; builds the libraries, then bundles + previews the demo)
make e2e-android        # Android: emulator running, APK built, Metro + backend up (see `make help`)
make e2e-ios            # iOS: simulator booted with the app installed, Metro + backend up

# Release plumbing
make version            # what a push to main would publish; make version TAG=vX.Y.Z for a release
make release            # merge the open release PR (release-please) - the whole stable release step
make release-rc V=X.Y.Z-rc.1   # hand-cut a prerelease-suffixed tag (ships under next)
```

### First release

The repo publishes a `next` prerelease from every green push to `main`
automatically. The first **stable** version still needs a human, but only for
one click: release-please proposes the version and the notes, and merging its
pull request is the release. Full walkthrough: [releasing.md](releasing.md).

1. **Land the work.** Either merge the phase branches in order (bootstrap →
   core → api → sumsub → rn → react → demos/E2E → docs), or open one PR for
   the whole v1 - the pipeline is identical either way. Every PR needs an
   approving review under the org ruleset; `main` is never pushed to directly.
2. **Wait for `main` to be green.** The Publish job refuses to ship from a red
   main run, and a release run against one is blocked until it turns green.
3. **Let release-please open the release PR.** The first `feat:` (or `fix:`)
   commit on `main` makes the `Release` workflow open
   `chore(release): 0.1.0` - `0.1.0` because `bump-minor-pre-major` turns a
   `feat` into a minor bump from the manifest's `0.0.1`. The PR carries the
   new `CHANGELOG.md`, the root `package.json` / `package-lock.json` version
   and `.release-please-manifest.json`; its body is the release notes. Nothing
   ships until it is merged.
4. **Check what the release would produce**, without touching anything:

```bash
DRY_RUN=1 node scripts/release/resolve-version.mjs         # the prerelease CI publishes today
#   -> version=0.0.1-pre.<run>.<sha>   disttag=next
make version                                                # the same thing, through make
make version TAG=v0.1.0                                     # what the tag would publish
#   -> version=0.1.0                  disttag=latest
```

   `DRY_RUN=1` prints the decision and skips both `npm pkg set` loops, so
   `package.json` stays at `0.0.0-development`.

5. **Approve the release PR and merge it:**

```bash
make release
```

   which merges the open `chore(release): 0.1.0` PR (the Merge button does the
   same). `release.yml` then tags `v0.1.0`, creates the GitHub Release
   from the changelog entry, and dispatches `ci.yml` at the tag with
   `release_tag=v0.1.0`. The tag *is* the version: that run stamps `0.1.0`
   into all four packages before building them and pins each one's
   `@blinkbitcoin/kyc-core` dependency to exactly `0.1.0`, so the packages'
   own `package.json` files stay at `0.0.0-development`.

6. **Watch Publish and Verify.** `Verify` (`scripts/release/registry-smoke.sh`)
   installs the published packages from GitHub Packages into a clean project
   and asserts the consumer contract - including that `/hosted` and `/testing`
   load without Apollo. You can re-run it later by hand:

```bash
make registry-smoke V=0.1.0
```

7. **If it fails**, fix forward and merge; the next release PR bumps again.
   GitHub Packages never accepts the same version twice, so `0.1.0` cannot be
   re-published. A run that failed *before* Publish can simply be re-run, and
   `release.yml`'s retry job re-runs a Publish that was blocked by a red main
   run.

**`CHANGELOG.md` is generated, never hand-edited on `main`.** release-please
writes it from the Conventional Commit PR titles, which is why the title is
linted by commitlint and is the line reviewers see; only `feat` / `fix` /
`perf` / `revert` appear there, so a CI-only fix is `ci:`, not `fix(ci):`.
Context can be added to the entry on the release PR's branch before merging.
