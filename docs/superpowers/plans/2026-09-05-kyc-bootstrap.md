# blinkbitcoin/kyc Bootstrap (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the public `blinkbitcoin/kyc` monorepo with esign's exact tooling, CI/CD, docs skeleton and six workspaces, so the pipeline (Checks → Unit → E2E → Badges → Publish `next` → Verify) is green end to end before any KYC domain code lands.

**Architecture:** npm-workspaces monorepo cloned in shape from `~/Dev/esign`: four publishable packages (`@blinkbitcoin/kyc-core`, `kyc-react-native`, `kyc-react`, `kyc-sumsub`), a reference backend (`apps/api`, Express 5 + Apollo Server 5 + Knex/Postgres) and two demo apps (RN 0.86 + Vite). Phase 1 ships only the smallest *real* slice of each workspace that exercises every CI stage: core contract types + capability guards, a health-only backend with the `ErrorCode` wire contract and one migration, placeholder platform/provider packages, demos that boot, and one Maestro/Playwright/backend-E2E flow each.

**Tech Stack:** TypeScript 6, Node 24 (flake), Jest 30 (packages, RN demo), Vitest 4 (api, web demo), tsup 8 (core/react/sumsub), react-native-builder-bob 0.43 (RN), Biome 2 + ESLint 9, lefthook 2, commitlint 21, Playwright 1.62, Maestro 2.6.1, GitHub Actions, GitHub Packages.

**Spec:** `~/.claude/plans/kyc/2026-09-05-kyc-design.md` (copied into the repo as `docs/superpowers/specs/2026-09-05-kyc-design.md` in Task 1).

## Global Constraints

- Repo: `blinkbitcoin/kyc`, public, MIT, default branch `main`. Org rulesets require a PR with approval for every branch: never push to `main` directly. The one exception is `gh-pages` (CI-owned badges).
- Local paths: `ESIGN=$HOME/Dev/esign` (template, never modified), `KYC=$HOME/Dev/kyc` (main clone, never checked out to a branch), `WT=$HOME/Dev/kyc-bootstrap` (worktree on branch `chore/bootstrap`). All commands in this plan run inside `$WT` unless stated.
- Package names: `@blinkbitcoin/kyc-core`, `@blinkbitcoin/kyc-react-native`, `@blinkbitcoin/kyc-react`, `@blinkbitcoin/kyc-sumsub`. Version placeholder `0.0.0-development`. Publish registry `https://npm.pkg.github.com`.
- Apollo-free subpath entry is `./hosted` (esign's `./webform`). Keep the `react-native` export condition pointing at `./src/*.ts` exactly like esign.
- Env/mode names: `KYC_PROVIDER` (`mock` | `sumsub`), `KYC_MODE` (RN demo: `native` | `hosted` | `proxy` | `fake-native`), `VITE_KYC_MODE` (web demo), test DB `kyc_test` on port 5433, dev DB `kyc` on 5432.
- Commit scopes: `core`, `rn`, `react`, `sumsub`, `api`, `demo`, `e2e`, `ci`, `deps`, `deps-dev`, `docs`, `release`. Every commit message and the PR title must pass commitlint.
- Coverage: 100% statements/branches/functions/lines on all four packages and `apps/api`; demos floored at 80%.
- Node engines `^22.22.2 || >= 24.15.0`; `graphql` pinned to 16.x; `typescript ^6.0.3`.
- No Blink-specific logic anywhere. No changes to any other blink-* repo.
- Do not add a `Claude-Session` trailer or claude.ai link to commits or the PR body.
- Every task ends with `npm run format` (Biome) before committing; lefthook pre-commit re-checks it.

---

### Task 1: Create the repository, the worktree, and copy the tooling verbatim

**Files:**
- Create: repo `blinkbitcoin/kyc` on GitHub, clone `$KYC`, worktree `$WT` on branch `chore/bootstrap`
- Create (copied verbatim from `$ESIGN`): `.editorconfig`, `.gitattributes`, `.gitignore`, `.npmrc`, `.envrc`, `LICENSE`, `audit-ci.jsonc`, `babel.config.js`, `biome.json`, `lefthook.yml`, `flake.nix`, `flake.lock`, `.github/dependabot.yml`, `.github/release.yml`, `.github/workflows/*.yml` (8 files), `scripts/**` (all), `docs/diagrams/src/` (empty dir), `docs/assets/` (empty dir)
- Create: `docs/superpowers/specs/2026-09-05-kyc-design.md`, `docs/superpowers/plans/2026-09-05-kyc-bootstrap.md`

**Interfaces:**
- Produces: a git worktree at `$WT` where every later task runs; the CI workflow files that later tasks adapt in place.

- [ ] **Step 1: Create the GitHub repo with an initial README commit on `main`**

```bash
gh repo create blinkbitcoin/kyc --public --add-readme \
  --description "Embedded identity verification (KYC) for React and React Native apps." \
  --homepage "https://github.com/blinkbitcoin/kyc"
gh repo clone blinkbitcoin/kyc "$HOME/Dev/kyc"
cd "$HOME/Dev/kyc" && git worktree add ../kyc-bootstrap -b chore/bootstrap origin/main
```

Expected: `gh repo view blinkbitcoin/kyc --json defaultBranchRef --jq .defaultBranchRef.name` prints `main`; `$WT` exists on branch `chore/bootstrap`.

- [ ] **Step 2: Copy the verbatim tooling files**

```bash
ESIGN="$HOME/Dev/esign"; WT="$HOME/Dev/kyc-bootstrap"; cd "$WT"
for f in .editorconfig .gitattributes .gitignore .npmrc .envrc LICENSE audit-ci.jsonc babel.config.js biome.json lefthook.yml flake.nix flake.lock; do cp "$ESIGN/$f" "$WT/$f"; done
mkdir -p .github/workflows scripts docs/diagrams/src docs/diagrams/dist docs/assets docs/superpowers/specs docs/superpowers/plans
cp "$ESIGN/.github/dependabot.yml" "$ESIGN/.github/release.yml" .github/
cp "$ESIGN"/.github/workflows/*.yml .github/workflows/
cp -R "$ESIGN/scripts/." scripts/
cp "$HOME/.claude/plans/kyc/2026-09-05-kyc-design.md" docs/superpowers/specs/
cp "$HOME/.claude/plans/kyc/2026-09-05-kyc-bootstrap.md" docs/superpowers/plans/
```

- [ ] **Step 3: Apply the mechanical renames to the copied tooling**

Only the files that contain the esign name (found with `grep -rl esign`). The order matters: multi-word patterns first.

```bash
cd "$WT"
sed -i '' -e 's/react-native-esignature dev environment/kyc dev environment/' flake.nix
sed -i '' -e 's/esign_test/kyc_test/g' scripts/ci/postgres-brew.sh scripts/e2e/db-wait.sh
sed -i '' -e 's/ESIGN_PROVIDER/KYC_PROVIDER/g' scripts/e2e/backend-up.sh
sed -i '' -e 's/ (webform-tagged flows excluded - they need an ESIGN_MODE=webform Metro)//' .github/workflows/e2e.yml
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('scripts/e2e/ios-maestro.sh'); s = p.read_text()
head, sep, rest = s.partition('set -uo pipefail')
p.write_text('#!/usr/bin/env bash\n# Maestro E2E on the iOS simulator: per-flow retries plus one suite-level\n# retry (a 124 timeout from maestro-bound.sh is not retried). Needs: app\n# installed on a booted simulator, Metro + backend running.\n' + sep + rest)
PY
grep -rn 'esign\|ESIGN' flake.nix scripts .github | grep -v 'pack-smoke\|registry-smoke\|resolve-version\|coverage-badge\|ci.yml'
```

Expected: the final grep prints nothing (the five listed files are rewritten in Task 10).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold repo tooling from esign"
```

---

### Task 2: Workspace manifests, root orchestration, and the lockfile

**Files:**
- Create: `package.json`, `Makefile`, `packages/Makefile`, `apps/Makefile`, `examples/Makefile`, `commitlint.config.mjs`, `eslint.config.js`, `.env.example`, `docker-compose.test.yml`
- Create: `packages/kyc-core/package.json`, `packages/kyc-react-native/package.json`, `packages/kyc-react/package.json`, `packages/kyc-sumsub/package.json`, `apps/api/package.json`, `examples/react-demo/package.json`, `examples/react-native-demo/package.json` (manifests only; sources come in Tasks 3–9)
- Create: `package-lock.json` (generated)

**Interfaces:**
- Produces: the workspace names later tasks target with `-w`, and the npm scripts CI calls (`test`, `test:coverage`, `typecheck`, `lint`, `format:check`, `build`, `check:packages`, `codegen`, `coverage:badge`).

- [ ] **Step 1: Root `package.json`**

```json
{
  "name": "kyc-monorepo",
  "version": "0.0.1",
  "private": true,
  "workspaces": ["packages/*", "apps/*", "examples/*"],
  "scripts": {
    "start": "npm run start -w examples/react-native-demo",
    "ios": "npm run ios -w examples/react-native-demo",
    "android": "npm run android -w examples/react-native-demo",
    "backend": "npm run dev -w apps/api",
    "test": "npm run test -w packages/kyc-core -w packages/kyc-sumsub -w packages/kyc-react-native -w packages/kyc-react -w examples/react-native-demo -w examples/react-demo -w apps/api",
    "test:coverage": "npm run test:coverage -w packages/kyc-core -w packages/kyc-sumsub -w packages/kyc-react-native -w packages/kyc-react -w examples/react-native-demo -w examples/react-demo && npm run test -w apps/api -- --coverage",
    "coverage:badge": "node scripts/coverage-badge.mjs",
    "test:e2e": "npm run test:e2e -w examples/react-native-demo",
    "test:e2e:backend": "npm run test:e2e -w apps/api",
    "typecheck": "npm run typecheck -w packages/kyc-core -w packages/kyc-sumsub -w packages/kyc-react-native -w packages/kyc-react -w examples/react-native-demo -w examples/react-demo -w apps/api",
    "lint": "eslint . && npm run lint -w apps/api",
    "format": "biome format --write examples packages && npm run format -w apps/api",
    "format:check": "biome format examples packages && npm run format:check -w apps/api",
    "build": "npm run build -w packages/kyc-core -w packages/kyc-sumsub -w packages/kyc-react-native -w packages/kyc-react",
    "check:packages": "publint packages/kyc-core && publint packages/kyc-sumsub && publint packages/kyc-react-native && publint packages/kyc-react && attw --pack packages/kyc-core --profile node16 && attw --pack packages/kyc-sumsub --profile node16 && attw --pack packages/kyc-react --profile node16",
    "web": "npm run dev -w examples/react-demo",
    "codegen": "npm run schema:emit -w apps/api && npm run codegen -w packages/kyc-core",
    "prepare": "lefthook install"
  },
  "devDependencies": {
    "@arethetypeswrong/cli": "^0.18.5",
    "@biomejs/biome": "^2.5.11",
    "@commitlint/cli": "^21.2.2",
    "@commitlint/config-conventional": "^21.2.2",
    "@eslint/eslintrc": "^3.3.6",
    "@react-native/eslint-config": "^0.87.1",
    "@typescript-eslint/eslint-plugin": "^8.69.0",
    "@typescript-eslint/parser": "^8.69.0",
    "audit-ci": "^7.1.0",
    "badge-maker": "^6.0.0",
    "eslint": "^9.39.5",
    "eslint-plugin-ft-flow": "^3.0.11",
    "eslint-plugin-jest": "^29.16.6",
    "lefthook": "^2.1.12",
    "publint": "^0.3.24"
  },
  "engines": { "node": "^22.22.2 || >= 24.15.0" },
  "license": "MIT"
}
```

- [ ] **Step 2: Root `Makefile` and the three group Makefiles**

```bash
cp "$ESIGN/Makefile" Makefile
cp "$ESIGN/packages/Makefile" packages/Makefile
cp "$ESIGN/apps/Makefile" apps/Makefile
cp "$ESIGN/examples/Makefile" examples/Makefile
```

Then edit `Makefile` with these exact replacements:
- `clean:` recipe line `npm run clean -w packages/esign-react-native -w packages/esign-react` → `npm run clean -w packages/kyc-core -w packages/kyc-sumsub -w packages/kyc-react-native -w packages/kyc-react`
- Delete the three targets `e2e-web-webform`, `e2e-web-publicurl`, `test-live` (each is a comment-less 4-line block) and remove `e2e-web-webform e2e-web-publicurl` and `test-live` from `.PHONY`.
- `e2e-backend-up` description: `Start the backend (mock provider) in the background for mobile E2E, wait for /health` stays as is.

Verify: `grep -n 'esign\|webform\|publicurl\|live' Makefile` prints nothing.

- [ ] **Step 3: `commitlint.config.mjs`, `eslint.config.js`, `.env.example`, `docker-compose.test.yml`**

`commitlint.config.mjs`:
```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'core', // packages/kyc-core
        'rn', // packages/kyc-react-native
        'react', // packages/kyc-react
        'sumsub', // packages/kyc-sumsub
        'api', // apps/api
        'demo', // examples/*
        'e2e',
        'ci',
        'deps',
        'deps-dev',
        'docs',
        'release',
      ],
    ],
    // Dependabot group titles and imperative subjects run long; keep the
    // conventional default but allow a little slack over 72.
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 100],
  },
};
```

`eslint.config.js`: `cp "$ESIGN/eslint.config.js" .` then `sed -i '' -e "s#packages/esign-react/\*\*#packages/kyc-react/**#" eslint.config.js`.

`.env.example`:
```bash
# Root-level env (loaded by direnv via .envrc; copy to .env, gitignored).
# Backend variables live in apps/api/.env.example - this file only carries
# the demo apps' bundle-time mode switches.

# Verification mode for the React Native demo (inlined when Metro bundles):
# native (default) | hosted | proxy | fake-native
# KYC_MODE=hosted

# Same for the web demo (Vite): hosted (default) | proxy
# VITE_KYC_MODE=proxy
```

`docker-compose.test.yml`: `cp "$ESIGN/docker-compose.test.yml" . && sed -i '' -e 's/esign_test/kyc_test/g' docker-compose.test.yml`.

- [ ] **Step 4: Package manifests (four packages)**

`packages/kyc-core/package.json`:
```json
{
  "name": "@blinkbitcoin/kyc-core",
  "version": "0.0.0-development",
  "description": "Platform-agnostic core (VerificationSource abstraction, capability guards, bridge protocol, error-code contract) shared by the KYC React and React Native packages",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "source": "./src/index.ts",
  "react-native": "./src/index.ts",
  "exports": {
    ".": {
      "react-native": "./src/index.ts",
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.ts", "default": "./dist/index.cjs" }
    },
    "./hosted": {
      "react-native": "./src/hosted.ts",
      "import": { "types": "./dist/hosted.d.mts", "default": "./dist/hosted.mjs" },
      "require": { "types": "./dist/hosted.d.ts", "default": "./dist/hosted.cjs" }
    },
    "./package.json": "./package.json"
  },
  "files": ["src", "dist", "!**/__tests__"],
  "sideEffects": false,
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "tsup",
    "clean": "rm -rf dist",
    "codegen": "graphql-codegen --config codegen.ts"
  },
  "keywords": ["kyc", "identity-verification", "sumsub"],
  "license": "MIT",
  "peerDependencies": { "@apollo/client": "^4.0.0", "graphql": "^16.8.0 || ^17.0.0" },
  "peerDependenciesMeta": { "@apollo/client": { "optional": true }, "graphql": { "optional": true } },
  "devDependencies": {
    "@apollo/client": "^4.2.12",
    "@babel/preset-env": "^7.29.7",
    "@babel/preset-typescript": "^7.29.0",
    "@graphql-codegen/cli": "^7.3.1",
    "@graphql-codegen/typescript": "^6.0.2",
    "@graphql-codegen/typescript-operations": "^6.0.5",
    "@types/jest": "^30.0.0",
    "graphql": "^16.14.2",
    "jest": "^30.5.0",
    "tsup": "^8.5.0",
    "typescript": "^6.0.3"
  },
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "repository": { "type": "git", "url": "git+https://github.com/blinkbitcoin/kyc.git", "directory": "packages/kyc-core" },
  "type": "commonjs",
  "engines": { "node": ">= 18" }
}
```

`packages/kyc-sumsub/package.json`:
```json
{
  "name": "@blinkbitcoin/kyc-sumsub",
  "version": "0.0.0-development",
  "description": "Sumsub provider adapters for @blinkbitcoin/kyc: shared status/event mapping, the React Native native-SDK source, and the web SDK source",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "source": "./src/index.ts",
  "react-native": "./src/index.ts",
  "exports": {
    ".": {
      "react-native": "./src/index.ts",
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.ts", "default": "./dist/index.cjs" }
    },
    "./react-native": {
      "react-native": "./src/react-native.ts",
      "import": { "types": "./dist/react-native.d.mts", "default": "./dist/react-native.mjs" },
      "require": { "types": "./dist/react-native.d.ts", "default": "./dist/react-native.cjs" }
    },
    "./web": {
      "import": { "types": "./dist/web.d.mts", "default": "./dist/web.mjs" },
      "require": { "types": "./dist/web.d.ts", "default": "./dist/web.cjs" }
    },
    "./package.json": "./package.json"
  },
  "files": ["src", "dist", "!**/__tests__"],
  "sideEffects": false,
  "scripts": {
    "test": "jest",
    "test:coverage": "jest --coverage",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "tsup",
    "clean": "rm -rf dist"
  },
  "keywords": ["kyc", "sumsub", "identity-verification", "react-native"],
  "license": "MIT",
  "dependencies": { "@blinkbitcoin/kyc-core": "0.0.0-development" },
  "peerDependencies": {
    "@sumsub/react-native-mobilesdk-module": ">=1.40.0",
    "@sumsub/websdk": ">=2.5.0",
    "react-native": ">=0.83.0"
  },
  "peerDependenciesMeta": {
    "@sumsub/react-native-mobilesdk-module": { "optional": true },
    "@sumsub/websdk": { "optional": true },
    "react-native": { "optional": true }
  },
  "devDependencies": {
    "@babel/preset-env": "^7.29.7",
    "@babel/preset-typescript": "^7.29.0",
    "@types/jest": "^30.0.0",
    "jest": "^30.5.0",
    "tsup": "^8.5.0",
    "typescript": "^6.0.3"
  },
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "repository": { "type": "git", "url": "git+https://github.com/blinkbitcoin/kyc.git", "directory": "packages/kyc-sumsub" },
  "type": "commonjs",
  "engines": { "node": ">= 18" }
}
```

`packages/kyc-react/package.json`: copy `$ESIGN/packages/esign-react/package.json`, then set `name` to `@blinkbitcoin/kyc-react`, `description` to `Plug-and-play identity-verification (KYC) flow component for React web apps`, `keywords` to `["react", "kyc", "identity-verification", "sumsub"]`, `dependencies` to `{ "@blinkbitcoin/kyc-core": "0.0.0-development" }`, `repository.url` to `git+https://github.com/blinkbitcoin/kyc.git`, `repository.directory` to `packages/kyc-react`. Everything else (scripts, peers, devDeps) stays byte-identical.

`packages/kyc-react-native/package.json`: copy `$ESIGN/packages/esign-react-native/package.json`, then set `name` to `@blinkbitcoin/kyc-react-native`, `description` to `Plug-and-play identity-verification (KYC) flow component for React Native (native provider SDK or hardened WebView)`, `keywords` to `["react-native", "kyc", "identity-verification", "sumsub"]`, `dependencies` to `{ "@blinkbitcoin/kyc-core": "0.0.0-development" }`, `repository.url`/`directory` to the kyc repo / `packages/kyc-react-native`, and rename the `./webform` export key to `./hosted` with every `webform` path segment inside it replaced by `hosted` (`./src/hosted.ts`, `./lib/typescript/module/src/hosted.d.ts`, `./lib/module/hosted.js`, `./lib/typescript/commonjs/src/hosted.d.ts`, `./lib/commonjs/hosted.js`). Scripts, peers, devDeps and the `react-native-builder-bob` block stay identical.

Verify: `grep -rn esign packages/*/package.json` prints nothing.

- [ ] **Step 5: `apps/api/package.json` and the demo manifests**

`apps/api/package.json`: copy `$ESIGN/apps/api/package.json` and set `"name": "api"` (unchanged), `"description": "Reference identity-verification backend: session/token issuance, provider webhooks, hosted verification page"`; remove the `test:live` script; keep every dependency version identical. Then add `"@blinkbitcoin/kyc-sumsub": "0.0.0-development"` under `dependencies` is **not** done in Phase 1 (Phase 4).

`examples/react-demo/package.json`:
```json
{
  "name": "kyc-react-example",
  "version": "0.0.1",
  "private": true,
  "description": "Example integration app for @blinkbitcoin/kyc-react (web)",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "start": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@apollo/client": "^4.2.12",
    "@blinkbitcoin/kyc-react": "0.0.0-development",
    "graphql": "^16.14.2",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.62.1",
    "@testing-library/react": "^16.3.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.5",
    "@vitejs/plugin-react": "^6.1.1",
    "@vitest/coverage-v8": "^4.1.11",
    "jsdom": "^30.0.1",
    "typescript": "^6.0.3",
    "vite": "^8.2.2",
    "vitest": "^4.1.9"
  },
  "license": "MIT"
}
```

`examples/react-native-demo/package.json`: copy `$ESIGN/examples/react-native-demo/package.json`; set `name` to `kyc-react-native-example`, `description` to `Example integration app for @blinkbitcoin/kyc-react-native (manual + Maestro E2E testing host)`; replace `@blinkbitcoin/esign-react-native` with `@blinkbitcoin/kyc-react-native` in `dependencies`; set `test:e2e` to `maestro test .maestro/ -e APP_ID=org.reactjs.native.example.ReactNativeSandbox`, `test:e2e:android` to `maestro test .maestro/ -e APP_ID=com.reactnativesandbox`, and delete the `test:e2e:webform` script. Everything else identical.

- [ ] **Step 6: Generate the lockfile and verify the install**

Each workspace still needs at least a stub entry file for `npm install` to succeed (workspaces do not require sources, only manifests). Run:

```bash
cd "$WT" && direnv allow . && direnv exec . npm install
direnv exec . node -e "console.log(require('./package-lock.json').packages['node_modules/@blinkbitcoin/kyc-core'].link)"
```

Expected: `npm install` exits 0, `package-lock.json` exists, the node prints `true`. If the shell node is not 24.x, `direnv exec .` is what makes the flake's node 24 the one running npm (engines are strict).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: add workspace manifests, root scripts and lockfile"
```

---

### Task 3: `apps/api` — health-only reference backend with the wire contract and one migration

**Files:**
- Create: `apps/api/{.envrc,.env.example,.env.test,.gitignore,Makefile,biome.json,docker-compose.yml,knexfile.ts,tsconfig.json,vitest.config.ts,vitest.e2e.config.ts,schema.graphql}`
- Create: `apps/api/scripts/emit-schema.ts`, `apps/api/migrations/20260905000000_create_verification_session_and_audit_tables.ts`
- Create: `apps/api/src/{index,server,app,auth,config,db,errors,instrumentation,log,schema,tracing,typeDefs}.ts`, `apps/api/src/__mocks__/db.ts`
- Test: `apps/api/tests/{setup,app.test,auth.test,config.test,db.test,errors.test,instrumentation.test,log.test,schema-artifact.test,schema.test,server.test,tracing.test}.ts`, `apps/api/tests/e2e/{setup,health.e2e.test}.ts`

**Interfaces:**
- Produces: `apps/api/schema.graphql` with `enum ErrorCode { UNAUTHORIZED VALIDATION_ERROR PROVIDER_UNAVAILABLE SESSION_NOT_FOUND SESSION_CREATION_FAILED PERSISTENCE_FAILED }` (Task 4's codegen input); `GET /health`; `POST /graphql` with `query { health { status timestamp } }`; `startServer(port)`; `validateSecurityConfig(env)` requiring `JWT_SECRET`, plus `SUMSUB_WEBHOOK_SECRET` when `KYC_PROVIDER=sumsub`, unless `ALLOW_INSECURE_DEV=true`.

- [ ] **Step 1: Copy the unchanged support files verbatim**

```bash
mkdir -p "$WT/apps/api" && cd "$WT/apps/api"
mkdir -p src/__mocks__ scripts migrations tests/e2e
for f in .envrc .gitignore biome.json knexfile.ts tsconfig.json vitest.e2e.config.ts; do cp "$ESIGN/apps/api/$f" .; done
cp "$ESIGN/apps/api/scripts/emit-schema.ts" scripts/
for f in index.ts auth.ts db.ts log.ts; do cp "$ESIGN/apps/api/src/$f" src/; done
cp "$ESIGN/apps/api/src/__mocks__/db.ts" src/__mocks__/
for f in setup.ts auth.test.ts log.test.ts schema-artifact.test.ts; do cp "$ESIGN/apps/api/tests/$f" tests/; done
cp "$ESIGN/apps/api/tests/db.test.ts" tests/ && sed -i '' -e 's/esign_test/kyc_test/g' tests/db.test.ts
cp "$ESIGN/apps/api/tests/instrumentation.test.ts" tests/ && sed -i '' -e 's/esign-api/kyc-api/g' tests/instrumentation.test.ts
```

`schema-artifact.test.ts` references `src/schema.ts` in a comment and imports `ErrorCodes` from `../src/errors` and `typeDefs` from `../src/typeDefs` — both exist after this task; leave it verbatim.

- [ ] **Step 2: Write the adapted config files**

`apps/api/Makefile`: copy `$ESIGN/apps/api/Makefile`, delete the `test-live` target (3 lines) and remove `test-live` from `.PHONY`.

`apps/api/docker-compose.yml`: copy and `sed -i '' -e 's/POSTGRES_DB: esign/POSTGRES_DB: kyc/'`.

`apps/api/.env.test`:
```bash
DATABASE_URL=postgresql://test:test@localhost:5433/kyc_test
KYC_PROVIDER=mock
# Test/dev run against the mock provider with no auth/webhook secrets:
# opt in explicitly (production must NEVER set this).
ALLOW_INSECURE_DEV=true
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

`apps/api/.env.example`:
```bash
# Database connection
DATABASE_URL=postgresql://dev:dev@localhost:5432/kyc

# Identity-verification provider selection
# Options: 'mock' (default) or 'sumsub'
# Use 'mock' for development and testing without Sumsub credentials
KYC_PROVIDER=mock

# Sumsub configuration (required when KYC_PROVIDER=sumsub; app-token auth -
# see docs/integration/sumsub.md once it exists)
# SUMSUB_APP_TOKEN=<app token>
# SUMSUB_SECRET_KEY=<secret key>
# SUMSUB_WEBHOOK_SECRET=<webhook secret key>
# SUMSUB_BASE_URL=https://api.sumsub.com

# JWT verification secret (HS256)
# When set, Authorization bearer tokens are verified as JWTs and the `sub`
# claim becomes the userId. When unset: dev treats the raw token as the
# userId; production treats every request as unauthenticated (fail-closed).
# JWT_SECRET=xxx

# Server configuration
PORT=4000

# --- Observability (OpenTelemetry, all optional - tracing is off unless set) ---
# OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
# OTEL_SERVICE_NAME=kyc-api
# OTEL_TRACES_EXPORTER=console

# --- Security (fail-closed by default) ---
# The server REFUSES TO START without JWT_SECRET (and SUMSUB_WEBHOOK_SECRET
# when KYC_PROVIDER=sumsub) unless you explicitly opt into insecure local dev:
# ALLOW_INSECURE_DEV=true            # NEVER set in production
# JWT_SECRET=change-me               # required in production (HS256 signing key)
# CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

`apps/api/README.md`:
```markdown
# api

Reference identity-verification backend (Express 5 + Apollo Server 5 +
Knex/Postgres). Bootstrap status: `GET /health`, the GraphQL `health` query,
the `ErrorCode` wire contract (`schema.graphql`, emitted from
`src/typeDefs.ts`) and the first migration. The `VerificationProvider` port,
mock + Sumsub adapters, webhook and hosted page land in the backend phase.

`make help` in this directory lists the local targets; the repo-wide E2E
flow is `make e2e-backend` at the root.
```

`apps/api/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // e2e has its own config (real Postgres)
    exclude: ['tests/e2e/**'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // index.ts is the server bootstrap (binds a real port, never imported
      // by tests) and is not meaningfully unit-testable.
      exclude: ['src/generated/**', 'src/index.ts'],
      // json-summary feeds scripts/coverage-badge.mjs (README badge + HTML report)
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
```

- [ ] **Step 3: Write the failing config test, then `src/config.ts`**

`tests/config.test.ts`:
```ts
// Tests for the security-config boot validation and helpers.

import { vi } from 'vitest';

import {
  getAllowedOrigins,
  isInsecureDevAllowed,
  isJwtRequired,
  isWebhookSignatureRequired,
  validateSecurityConfig,
} from '../src/config';

describe('isInsecureDevAllowed', () => {
  it('is true only for the exact string "true"', () => {
    expect(isInsecureDevAllowed({ ALLOW_INSECURE_DEV: 'true' })).toBe(true);
    expect(isInsecureDevAllowed({ ALLOW_INSECURE_DEV: 'TRUE' })).toBe(false);
    expect(isInsecureDevAllowed({ ALLOW_INSECURE_DEV: '1' })).toBe(false);
    expect(isInsecureDevAllowed({})).toBe(false);
  });
});

describe('isJwtRequired / isWebhookSignatureRequired', () => {
  it('require secrets unless insecure-dev is allowed', () => {
    expect(isJwtRequired({})).toBe(true);
    expect(isWebhookSignatureRequired({})).toBe(true);
    expect(isJwtRequired({ ALLOW_INSECURE_DEV: 'true' })).toBe(false);
    expect(isWebhookSignatureRequired({ ALLOW_INSECURE_DEV: 'true' })).toBe(false);
  });
});

describe('validateSecurityConfig', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes and warns when insecure-dev is explicitly allowed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateSecurityConfig({ ALLOW_INSECURE_DEV: 'true' })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ALLOW_INSECURE_DEV=true'));
  });

  it('throws when JWT_SECRET is missing and insecure-dev is not allowed', () => {
    expect(() => validateSecurityConfig({})).toThrow(/JWT_SECRET/);
  });

  it('passes with JWT_SECRET set and the default (mock) provider', () => {
    expect(() => validateSecurityConfig({ JWT_SECRET: 's' })).not.toThrow();
  });

  it('requires SUMSUB_WEBHOOK_SECRET when the provider is sumsub', () => {
    expect(() => validateSecurityConfig({ JWT_SECRET: 's', KYC_PROVIDER: 'sumsub' })).toThrow(
      /SUMSUB_WEBHOOK_SECRET/
    );
  });

  it('passes for sumsub when both secrets are set', () => {
    expect(() =>
      validateSecurityConfig({ JWT_SECRET: 's', KYC_PROVIDER: 'sumsub', SUMSUB_WEBHOOK_SECRET: 'k' })
    ).not.toThrow();
  });

  it('does not require the webhook secret for the mock provider', () => {
    expect(() => validateSecurityConfig({ JWT_SECRET: 's', KYC_PROVIDER: 'mock' })).not.toThrow();
  });

  it('lists every missing secret at once', () => {
    expect(() => validateSecurityConfig({ KYC_PROVIDER: 'sumsub' })).toThrow(
      /JWT_SECRET.*SUMSUB_WEBHOOK_SECRET/s
    );
  });
});

describe('getAllowedOrigins', () => {
  it('is empty by default', () => {
    expect(getAllowedOrigins({})).toEqual([]);
  });

  it('splits, trims, and drops blanks', () => {
    expect(getAllowedOrigins({ CORS_ALLOWED_ORIGINS: 'https://a.com, https://b.com ,, ' })).toEqual(
      ['https://a.com', 'https://b.com']
    );
  });
});
```

Run: `cd "$WT" && direnv exec . npm test -w apps/api -- tests/config.test.ts`
Expected: FAIL (`Cannot find module '../src/config'`).

`src/config.ts`:
```ts
export const isInsecureDevAllowed = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.ALLOW_INSECURE_DEV === 'true';

export const isJwtRequired = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !isInsecureDevAllowed(env);

export const isWebhookSignatureRequired = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !isInsecureDevAllowed(env);

export const validateSecurityConfig = (env: NodeJS.ProcessEnv = process.env): void => {
  if (isInsecureDevAllowed(env)) {
    console.warn(
      '⚠️  ALLOW_INSECURE_DEV=true - JWT and webhook signature verification may be bypassed. NEVER set this in production.'
    );
    return;
  }

  const missing: string[] = [];

  if (!env.JWT_SECRET) {
    missing.push('JWT_SECRET (or set ALLOW_INSECURE_DEV=true for local dev)');
  }

  if ((env.KYC_PROVIDER ?? 'mock') === 'sumsub' && !env.SUMSUB_WEBHOOK_SECRET) {
    missing.push('SUMSUB_WEBHOOK_SECRET (or set ALLOW_INSECURE_DEV=true for local dev)');
  }

  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: missing required security configuration: ${missing.join(', ')}`
    );
  }
};

export const getAllowedOrigins = (env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
```

Run the test again. Expected: PASS.

- [ ] **Step 4: Errors + typeDefs + schema artifact (wire contract)**

`tests/errors.test.ts`:
```ts
import { GraphQLError } from 'graphql';
import { createError, ErrorCodes, Errors } from '../src/errors';

describe('createError', () => {
  it('builds a GraphQLError carrying the code in extensions', () => {
    const err = createError(ErrorCodes.VALIDATION_ERROR, 'bad input');
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.message).toBe('bad input');
    expect(err.extensions.code).toBe('VALIDATION_ERROR');
  });
});

describe('Errors factories', () => {
  it('each factory uses its own code and a default message', () => {
    expect(Errors.unauthorized().extensions.code).toBe('UNAUTHORIZED');
    expect(Errors.sessionNotFound().extensions.code).toBe('SESSION_NOT_FOUND');
    expect(Errors.sessionCreationFailed().extensions.code).toBe('SESSION_CREATION_FAILED');
    expect(Errors.providerUnavailable().extensions.code).toBe('PROVIDER_UNAVAILABLE');
    expect(Errors.persistenceFailed().extensions.code).toBe('PERSISTENCE_FAILED');
    expect(Errors.validationError('x').extensions.code).toBe('VALIDATION_ERROR');
    expect(Errors.validationError('x').message).toBe('x');
  });

  it('accepts a custom message', () => {
    expect(Errors.unauthorized('nope').message).toBe('nope');
    expect(Errors.sessionNotFound('gone').message).toBe('gone');
    expect(Errors.sessionCreationFailed('boom').message).toBe('boom');
    expect(Errors.providerUnavailable('down').message).toBe('down');
    expect(Errors.persistenceFailed('db').message).toBe('db');
  });
});
```

`src/errors.ts`:
```ts
import { GraphQLError } from 'graphql';

// Error codes as const object for type safety. This list IS the wire
// contract: tests/schema-artifact.test.ts asserts it matches the ErrorCode
// enum in src/typeDefs.ts, and packages/kyc-core regenerates its enum from
// the emitted schema.graphql (`make codegen`).
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const createError = (code: ErrorCode, message: string): GraphQLError =>
  new GraphQLError(message, { extensions: { code } });

export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    createError(ErrorCodes.UNAUTHORIZED, message),
  validationError: (message: string) => createError(ErrorCodes.VALIDATION_ERROR, message),
  providerUnavailable: (message = 'Verification service temporarily unavailable') =>
    createError(ErrorCodes.PROVIDER_UNAVAILABLE, message),
  sessionNotFound: (message = 'Verification session not found') =>
    createError(ErrorCodes.SESSION_NOT_FOUND, message),
  sessionCreationFailed: (message = 'Failed to create verification session') =>
    createError(ErrorCodes.SESSION_CREATION_FAILED, message),
  persistenceFailed: (message = 'Failed to save verification data') =>
    createError(ErrorCodes.PERSISTENCE_FAILED, message),
};
```

`src/typeDefs.ts`:
```ts
// GraphQL SDL - kept free of runtime imports so tooling (schema emission,
// drift tests, client codegen) can load it without a database connection.
// Phase 1 carries only the health query and the ErrorCode wire contract;
// the verification session operations arrive with the backend phase.

export const typeDefs = `#graphql
  type Query {
    health: HealthCheck!
  }

  type HealthCheck {
    status: String!
    timestamp: String!
  }

  # Wire contract: every code a resolver can put in extensions.code.
  # Mirrored by src/errors.ts (tested) and regenerated into
  # packages/kyc-core/src/generated/error-code.ts by \`make codegen\`.
  enum ErrorCode {
    UNAUTHORIZED
    VALIDATION_ERROR
    PROVIDER_UNAVAILABLE
    SESSION_NOT_FOUND
    SESSION_CREATION_FAILED
    PERSISTENCE_FAILED
  }
`;
```

`src/schema.ts`:
```ts
// GraphQL schema and resolvers. Phase 1: health only.

export { typeDefs } from './typeDefs';

export const resolvers = {
  Query: {
    health: () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  },
};
```

`tests/schema.test.ts`:
```ts
import { resolvers } from '../src/schema';

describe('resolvers.Query.health', () => {
  it('reports ok with an ISO timestamp', () => {
    const result = resolvers.Query.health();
    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
```

Emit the artifact: `cd "$WT" && direnv exec . npm run schema:emit -w apps/api`. Expected: `apps/api/schema.graphql` written; its `enum ErrorCode` lists the six codes.

Run: `direnv exec . npm test -w apps/api -- tests/errors.test.ts tests/schema.test.ts tests/schema-artifact.test.ts`. Expected: PASS.

- [ ] **Step 5: Tracing helpers (trimmed to the generic part) + test**

`src/tracing.ts`:
```ts
// Domain-level tracing helpers on the @opentelemetry/api facade.
//
// The facade is zero-cost: when the SDK (src/instrumentation.ts) has not
// been started, every span here is a no-op - so this module is safe to use
// unconditionally in dev, test, and production code paths.
//
// PII discipline: span attributes carry ids, statuses, and types - never
// applicant names, document data, or images.

import type { Attributes, Span } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('kyc-api');

const recordFailure = (span: Span, error: unknown): void => {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
};

// Run an async operation inside an active span: records exceptions, sets
// error status, and always ends the span.
export const withSpan = async <T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>
): Promise<T> =>
  tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      recordFailure(span, error);
      throw error;
    } finally {
      span.end();
    }
  });

// Synchronous variant (webhook verification / parsing)
export const withSpanSync = <T>(name: string, attributes: Attributes, fn: (span: Span) => T): T =>
  tracer.startActiveSpan(name, { attributes }, (span) => {
    try {
      return fn(span);
    } catch (error) {
      recordFailure(span, error);
      throw error;
    } finally {
      span.end();
    }
  });

// Attach attributes to whatever span is currently active. No-op when none is.
export const setActiveSpanAttributes = (attributes: Attributes): void => {
  trace.getActiveSpan()?.setAttributes(attributes);
};
```

`tests/tracing.test.ts`:
```ts
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { vi } from 'vitest';
import { setActiveSpanAttributes, withSpan, withSpanSync } from '../src/tracing';

const makeSpan = () => ({
  recordException: vi.fn(),
  setStatus: vi.fn(),
  setAttributes: vi.fn(),
  end: vi.fn(),
});

describe('withSpan / withSpanSync', () => {
  let span: ReturnType<typeof makeSpan>;

  beforeEach(() => {
    span = makeSpan();
    vi.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: (_name: string, _opts: unknown, fn: (s: unknown) => unknown) => fn(span),
    } as never);
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns the callback result and ends the span', async () => {
    await expect(withSpan('op', {}, async () => 42)).resolves.toBe(42);
    expect(span.end).toHaveBeenCalledOnce();
    expect(span.setStatus).not.toHaveBeenCalled();
  });

  it('records an Error, sets ERROR status, rethrows, and still ends the span', async () => {
    const err = new Error('boom');
    await expect(withSpan('op', {}, async () => { throw err; })).rejects.toBe(err);
    expect(span.recordException).toHaveBeenCalledWith(err);
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR, message: 'boom' });
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('stringifies non-Error throwables', async () => {
    await expect(withSpan('op', {}, async () => { throw 'raw'; })).rejects.toBe('raw');
    expect(span.recordException).toHaveBeenCalledWith('raw');
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR, message: 'raw' });
  });

  it('sync variant returns the result', () => {
    expect(withSpanSync('op', {}, () => 'ok')).toBe('ok');
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('sync variant records failures and rethrows', () => {
    expect(() => withSpanSync('op', {}, () => { throw new Error('sync'); })).toThrow('sync');
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR, message: 'sync' });
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('sync variant stringifies non-Error throwables', () => {
    expect(() => withSpanSync('op', {}, () => { throw 7; })).toThrow();
    expect(span.recordException).toHaveBeenCalledWith('7');
  });
});

describe('setActiveSpanAttributes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forwards to the active span', () => {
    const active = makeSpan();
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(active as never);
    setActiveSpanAttributes({ 'enduser.id': 'u1' });
    expect(active.setAttributes).toHaveBeenCalledWith({ 'enduser.id': 'u1' });
  });

  it('is a no-op without an active span', () => {
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);
    expect(() => setActiveSpanAttributes({ a: 1 })).not.toThrow();
  });
});
```

`src/instrumentation.ts`: copy from esign and apply `sed -i '' -e "s/'esign-api'/'kyc-api'/; s/blink-kyc's/the house/; s/DocuSign API calls need this one/provider API calls need this one/" src/instrumentation.ts`.

Run: `direnv exec . npm test -w apps/api -- tests/tracing.test.ts tests/instrumentation.test.ts`. Expected: PASS.

- [ ] **Step 6: `app.ts`, `server.ts` and their tests**

`src/app.ts`:
```ts
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { getUserIdFromAuthHeader } from './auth';
import { getAllowedOrigins } from './config';
import { resolvers, typeDefs } from './schema';
import { setActiveSpanAttributes } from './tracing';

const BODY_LIMIT = '64kb';

export interface GraphQLContext {
  userId: string | null;
}

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

const corsOptions = (): cors.CorsOptions => {
  const allowed = getAllowedOrigins();
  return { origin: allowed.length > 0 ? allowed : false };
};

const makeRateLimiter = (windowMs: number, max: number) =>
  rateLimit({ windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false });

export const createApp = async (): Promise<express.Express> => {
  const app = express();

  if (isProduction()) {
    app.set('trust proxy', 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));

  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    introspection: !isProduction(),
    includeStacktraceInErrorResponses: false,
  });

  await server.start();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(
    '/graphql',
    makeRateLimiter(60_000, 100),
    cors<cors.CorsRequest>(corsOptions()),
    express.json({ limit: BODY_LIMIT }),
    expressMiddleware(server, {
      context: async ({ req }) => {
        const userId = getUserIdFromAuthHeader(req.headers.authorization);
        if (userId) {
          setActiveSpanAttributes({ 'enduser.id': userId });
        }
        return { userId };
      },
    })
  );

  return app;
};
```

`src/server.ts`:
```ts
// HTTP server startup, separated from the index.ts bootstrap for testability.

import http from 'http';
import type { AddressInfo } from 'net';
import { createApp } from './app';
import { validateSecurityConfig } from './config';

// Pass port 0 for an ephemeral port (tests). Returns the server so callers
// can inspect its address or close it.
export const startServer = async (port: number): Promise<http.Server> => {
  // Fail closed at boot: refuse to start without the required security
  // secrets unless ALLOW_INSECURE_DEV=true is explicitly set.
  validateSecurityConfig();

  const app = await createApp();
  const httpServer = http.createServer(app);

  await new Promise<void>((resolve) => httpServer.listen({ port }, resolve));

  const boundPort = (httpServer.address() as AddressInfo).port;
  console.log(`🚀 Server ready at http://localhost:${boundPort}/graphql`);
  console.log(`🏥 Health check at http://localhost:${boundPort}/health`);
  console.log(`🪪 Verification provider: ${process.env.KYC_PROVIDER || 'mock'}`);

  return httpServer;
};
```

`tests/app.test.ts`:
```ts
import type { Express } from 'express';
import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../src/app';

describe('createApp', () => {
  let app: Express;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCors = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCors === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = originalCors;
    vi.restoreAllMocks();
  });

  it('serves GET /health', async () => {
    app = await createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('answers the health query over GraphQL with an unauthenticated context', async () => {
    app = await createApp();
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ health { status timestamp } }' });
    expect(res.status).toBe(200);
    expect(res.body.data.health.status).toBe('ok');
  });

  it('tags the active span with the user id when a bearer token is present', async () => {
    // Insecure-dev passthrough (tests/setup.ts): the bearer token IS the userId.
    const { trace } = await import('@opentelemetry/api');
    const setAttributes = vi.fn();
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ setAttributes } as never);
    app = await createApp();
    await request(app)
      .post('/graphql')
      .set('authorization', 'Bearer user-42')
      .send({ query: '{ health { status } }' });
    expect(setAttributes).toHaveBeenCalledWith({ 'enduser.id': 'user-42' });
  });

  it('honours CORS_ALLOWED_ORIGINS on /graphql', async () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example';
    app = await createApp();
    const res = await request(app)
      .post('/graphql')
      .set('origin', 'https://allowed.example')
      .send({ query: '{ health { status } }' });
    expect(res.headers['access-control-allow-origin']).toBe('https://allowed.example');
  });

  it('trusts the first proxy and disables introspection in production', async () => {
    process.env.NODE_ENV = 'production';
    app = await createApp();
    expect(app.get('trust proxy')).toBe(1);
    const res = await request(app)
      .post('/graphql')
      .send({ query: '{ __schema { queryType { name } } }' });
    expect(res.body.errors?.[0]?.message).toMatch(/introspection/i);
  });
});
```

`tests/server.test.ts`: copy from esign and apply `sed -i '' -e 's/ESIGN_PROVIDER/KYC_PROVIDER/g; s/E-signature provider: mock/Verification provider: mock/g' tests/server.test.ts`.

Run: `direnv exec . npm test -w apps/api -- tests/app.test.ts tests/server.test.ts`. Expected: PASS. Then `direnv exec . npm test -w apps/api -- --coverage`. Expected: all suites pass, thresholds 100% met (if `instrumentation.ts` or `auth.ts` branches are uncovered, the copied esign tests already cover them; investigate any gap rather than lowering the threshold).

- [ ] **Step 7: Migration + backend E2E**

`migrations/20260905000000_create_verification_session_and_audit_tables.ts`:
```ts
import type { Knex } from 'knex';

// One row per verification attempt the backend brokered (mode 3), keyed by
// our own id; the provider's applicant id is stored but never exposed over
// GraphQL. Audit rows record lifecycle actions with PII-free metadata.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('VerificationSession'))) {
    await knex.schema.createTable('VerificationSession', (table) => {
      table.text('id').primary();
      table.text('userId').notNullable();
      table.text('provider').notNullable();
      table.text('providerApplicantId').nullable().unique();
      table.text('levelName').nullable();
      table.text('platform').notNullable();
      table.text('status').notNullable();
      table.timestamp('createdAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updatedAt', { precision: 3 }).notNullable().defaultTo(knex.fn.now());
      table.index(['userId']);
    });
  }

  if (!(await knex.schema.hasTable('AuditLog'))) {
    await knex.schema.createTable('AuditLog', (table) => {
      table.text('id').primary();
      table
        .text('sessionId')
        .notNullable()
        .references('id')
        .inTable('VerificationSession')
        .onDelete('CASCADE');
      table.text('action').notNullable();
      table.timestamp('timestamp', { precision: 3 }).notNullable().defaultTo(knex.fn.now());
      table.jsonb('metadata');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('AuditLog');
  await knex.schema.dropTableIfExists('VerificationSession');
}
```

`tests/e2e/setup.ts`: copy from esign and replace the two `TRUNCATE` statements with `await knex.raw('TRUNCATE TABLE "AuditLog", "VerificationSession" CASCADE');` (both in `beforeAll` and `afterAll`), and the comment `AuditLog references Envelope` with `AuditLog references VerificationSession`.

`tests/e2e/health.e2e.test.ts`:
```ts
// Backend E2E smoke against a real Postgres: the app boots, the migration
// applied, and the health endpoints answer.

import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { knex } from './setup';

describe('health (E2E)', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  it('applied the VerificationSession and AuditLog tables', async () => {
    expect(await knex.schema.hasTable('VerificationSession')).toBe(true);
    expect(await knex.schema.hasTable('AuditLog')).toBe(true);
  });

  it('GET /health is ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GraphQL health is ok', async () => {
    const res = await request(app).post('/graphql').send({ query: '{ health { status } }' });
    expect(res.body.data.health.status).toBe('ok');
  });
});
```

Run: `cd "$WT" && direnv exec . make e2e-backend` (needs Docker). Expected: DB up, migration applied, 3 tests pass, DB down.

- [ ] **Step 8: Format, lint, commit**

```bash
cd "$WT" && direnv exec . npm run format -w apps/api && direnv exec . npm run lint -w apps/api && direnv exec . npm run typecheck -w apps/api
git add -A && git commit -m "feat(api): health-only reference backend with the ErrorCode wire contract"
```

---

### Task 4: `@blinkbitcoin/kyc-core` — contract types, capability guards, hosted entry, codegen

**Files:**
- Create: `packages/kyc-core/{tsconfig.json,tsup.config.ts,jest.config.js,babel.config.js,codegen.ts,Makefile,LICENSE,README.md}`
- Create: `packages/kyc-core/src/{index,hosted,errors}.ts`, `packages/kyc-core/src/verification/{types,index}.ts`, `packages/kyc-core/src/generated/error-code.ts` (generated)
- Test: `packages/kyc-core/src/verification/__tests__/guards.test.ts`, `packages/kyc-core/src/__tests__/{hosted-entry,wire-contract}.test.ts`

**Interfaces:**
- Produces (exact exports of both `.` and `./hosted`): types `VerificationStatus`, `VerificationEvent`, `VerificationSession`, `VerificationResult`, `VerificationSourceError`, `VerificationSource`, `TokenRefreshableSource`, `LaunchableSource`; guards `isTokenRefreshable(source)`, `isLaunchable(source)`; `ErrorCodes` const + `ErrorCode` enum.

- [ ] **Step 1: Package config files**

```bash
mkdir -p "$WT/packages/kyc-core/src/verification/__tests__" "$WT/packages/kyc-core/src/__tests__" "$WT/packages/kyc-core/src/generated" && cd "$WT/packages/kyc-core"
cp "$ESIGN/packages/esign-core/tsconfig.json" "$ESIGN/packages/esign-core/babel.config.js" "$ESIGN/packages/esign-core/Makefile" "$ESIGN/LICENSE" .
```

`tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/hosted.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@apollo/client', 'graphql'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
```

`jest.config.js`:
```js
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/generated/',
    'src/verification/index\\.ts$',
    'src/index\\.ts$',
    'src/hosted\\.ts$',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
```

`codegen.ts`:
```ts
import type { CodegenConfig } from '@graphql-codegen/cli';

// Generates the runtime ErrorCode enum (the wire contract) from the backend's
// emitted schema artifact (apps/api/schema.graphql). Run via `npm run codegen`
// (root) after schema changes; the parity test fails if this output drifts.
// Operation types join here once the session operations exist.
const config: CodegenConfig = {
  schema: '../../apps/api/schema.graphql',
  generates: {
    'src/generated/error-code.ts': {
      plugins: ['typescript'],
      config: { onlyEnums: true },
    },
  },
};

export default config;
```

`README.md`:
```markdown
# @blinkbitcoin/kyc-core

Platform-agnostic core shared by `@blinkbitcoin/kyc-react-native` and
`@blinkbitcoin/kyc-react`: the `VerificationSource` abstraction and its
capability interfaces, the normalized event/status vocabulary, and the
`ErrorCode` wire contract generated from `apps/api/schema.graphql`. No React,
no DOM, no native modules.

| Import | Contents | Needs Apollo? |
|--------|----------|---------------|
| `@blinkbitcoin/kyc-core` | Everything | Yes, once the proxy source lands (optional peers) |
| `@blinkbitcoin/kyc-core/hosted` | Contract types, guards, error codes | **No — Apollo-free by construction** (guard-tested) |

Status: bootstrap. The sources (`createProxySource`, hosted bridge protocol)
follow in the core phase — see `docs/superpowers/specs/2026-09-05-kyc-design.md`.
```

- [ ] **Step 2: Failing guard tests**

`src/verification/__tests__/guards.test.ts`:
```ts
import { isLaunchable, isTokenRefreshable } from '../index';
import type { VerificationSession, VerificationSource } from '../types';

const session: VerificationSession = { provider: 'mock' };

const plain: VerificationSource = {
  start: async () => session,
  interpret: () => null,
};

describe('isLaunchable', () => {
  it('is false for a plain source', () => {
    expect(isLaunchable(plain)).toBe(false);
  });

  it('is true when launch() is a function', () => {
    const launchable = { ...plain, launch: async () => ({ status: 'approved' as const }) };
    expect(isLaunchable(launchable)).toBe(true);
  });
});

describe('isTokenRefreshable', () => {
  it('is false for a plain source', () => {
    expect(isTokenRefreshable(plain)).toBe(false);
  });

  it('is true when refreshToken() is a function', () => {
    const refreshable = { ...plain, refreshToken: async () => 'token' };
    expect(isTokenRefreshable(refreshable)).toBe(true);
  });
});
```

Run: `cd "$WT" && direnv exec . npm test -w packages/kyc-core`. Expected: FAIL (`Cannot find module '../index'`).

- [ ] **Step 3: Contract types and guards**

`src/verification/types.ts`:
```ts
// The verification-source abstraction: the seam that lets one <Verification>
// component drive any provider in any mode (native SDK, hosted page, proxy).
//
// Platform-agnostic (no React, no WebView/iframe, no native module) -
// identical in the web and React Native packages. Only the component that
// embeds/launches differs per platform.

/** Normalized applicant status, regardless of provider. */
export type VerificationStatus =
  | 'initial'
  | 'incomplete'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'finallyRejected';

/** Normalized event the component acts on, regardless of provider. */
export type VerificationEvent =
  | { type: 'applicantLoaded'; applicantId: string }
  | { type: 'submitted' }
  | { type: 'statusChanged'; status: VerificationStatus }
  | { type: 'complete'; status: VerificationStatus; applicantId?: string }
  | { type: 'cancel' }
  /** Hosted mode only: the page's token expired; a refreshable source can mint a new one. */
  | { type: 'tokenExpired' }
  /** The session itself is over and cannot be refreshed - restart from scratch. */
  | { type: 'sessionExpired' }
  | { type: 'error'; code: string; message?: string };

/** A resolved verification session: what a mode needs to run it. */
export interface VerificationSession {
  /** Provider id, e.g. 'sumsub' or 'mock'. */
  provider: string;
  /** Backend session id (proxy mode). */
  sessionId?: string;
  /** Provider access token (native / web SDK modes). */
  accessToken?: string;
  /** Page URL to embed (hosted mode). */
  url?: string;
  /** Origin to accept postMessage from (hosted mode, defense in depth). */
  allowedOrigin?: string;
  applicantId?: string;
}

/** Terminal outcome handed to onComplete. */
export interface VerificationResult {
  status: VerificationStatus;
  applicantId?: string;
}

/** Rejection shape from start() so the component can show a code. */
export interface VerificationSourceError {
  code: string;
  message?: string;
}

/**
 * A verification mode: knows how to acquire its session and read its own
 * events. Adding a provider or mode = a new VerificationSource; the
 * component never changes (Open/Closed).
 */
export interface VerificationSource {
  start(): Promise<VerificationSession>;
  /** Translate a raw embedded-page message into a normalized event, or null. */
  interpret(message: unknown): VerificationEvent | null;
}

/** Hosted mode: a source that can mint a fresh access token for the page. */
export interface TokenRefreshableSource extends VerificationSource {
  refreshToken(previous: VerificationSession): Promise<string>;
}

/** Native SDK mode: a source that runs the provider's SDK in-process. */
export interface LaunchableSource extends VerificationSource {
  launch(
    session: VerificationSession,
    onEvent: (event: VerificationEvent) => void,
  ): Promise<VerificationResult>;
}

/** Capability checks - structural, like esign's isRestartable. */
export const isTokenRefreshable = (
  source: VerificationSource,
): source is TokenRefreshableSource =>
  typeof (source as TokenRefreshableSource).refreshToken === 'function';

export const isLaunchable = (
  source: VerificationSource,
): source is LaunchableSource =>
  typeof (source as LaunchableSource).launch === 'function';
```

`src/verification/index.ts`:
```ts
export { isLaunchable, isTokenRefreshable } from './types';
export type {
  LaunchableSource,
  TokenRefreshableSource,
  VerificationEvent,
  VerificationResult,
  VerificationSession,
  VerificationSource,
  VerificationSourceError,
  VerificationStatus,
} from './types';
```

Run the guard test. Expected: PASS.

- [ ] **Step 4: Codegen, error codes, parity test**

Run: `cd "$WT" && direnv exec . npm run codegen`. Expected: `packages/kyc-core/src/generated/error-code.ts` exports `enum ErrorCode` with the six members.

`src/errors.ts`:
```ts
// Wire-contract error codes as a const map (mirrors the schema enum; parity
// is tested against src/generated/error-code.ts). Client-side codes join
// this map in the core phase.
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
} as const;

export type ErrorCodeValue = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const isKnownErrorCode = (code: string): code is ErrorCodeValue =>
  Object.values(ErrorCodes).includes(code as ErrorCodeValue);
```

`src/__tests__/wire-contract.test.ts`:
```ts
/**
 * Wire-contract parity: the package's ErrorCodes map must exactly match the
 * ErrorCode enum generated from apps/api/schema.graphql. If this fails after
 * a schema change, run `npm run codegen` and update ErrorCodes.
 */

import { ErrorCodes, isKnownErrorCode } from '../errors';
import { ErrorCode } from '../generated/error-code';

describe('ErrorCodes wire contract', () => {
  it('matches the schema-generated ErrorCode enum exactly', () => {
    expect(Object.values(ErrorCodes).sort()).toEqual(Object.values(ErrorCode).sort());
  });

  it('isKnownErrorCode recognizes contract codes only', () => {
    expect(isKnownErrorCode('UNAUTHORIZED')).toBe(true);
    expect(isKnownErrorCode('NOPE')).toBe(false);
  });
});
```

- [ ] **Step 5: Entries and the Apollo-free guard**

`src/index.ts`:
```ts
// @blinkbitcoin/kyc-core - platform-agnostic core shared by the RN and web
// verification packages. Bootstrap surface: the VerificationSource contract
// + capability guards and the ErrorCode wire contract. The proxy source and
// the Apollo client factory join here in the core phase; ./hosted stays
// Apollo-free by construction.

export * from './verification';
export { ErrorCodes, isKnownErrorCode } from './errors';
export type { ErrorCodeValue } from './errors';
export { ErrorCode } from './generated/error-code';
```

`src/hosted.ts`:
```ts
// Apollo-free entry (hosted mode): everything a host embedding a hosted
// verification page needs, without @apollo/client or graphql.
export * from './verification';
export { ErrorCodes, isKnownErrorCode } from './errors';
export type { ErrorCodeValue } from './errors';
export { ErrorCode } from './generated/error-code';
```

`src/__tests__/hosted-entry.test.ts`: copy `$ESIGN/packages/esign-core/src/__tests__/webform-entry.test.ts` and apply:
- `sed -i '' -e "s#'webform.ts'#'hosted.ts'#g; s#@blinkbitcoin/esign-core#@blinkbitcoin/kyc-core#g; s#Guard: the ./webform entry#Guard: the ./hosted entry#; s#from src/webform.ts#from src/hosted.ts#; s#Web Forms-only consumer#hosted-only consumer#; s#webform entry (Apollo-free guarantee)#hosted entry (Apollo-free guarantee)#"`
- Replace `expect(files.length).toBeGreaterThan(3);` with `expect(files.length).toBeGreaterThan(2);`
- Delete the second `it(...)` block (`the full index DOES reach Apollo`) entirely; it returns in the core phase when `index.ts` imports the proxy source.

Run: `direnv exec . npm test -w packages/kyc-core -- --coverage && direnv exec . npm run typecheck -w packages/kyc-core && direnv exec . npm run build -w packages/kyc-core`. Expected: 3 suites pass, 100% coverage, `dist/{index,hosted}.{mjs,cjs,d.ts,d.mts}` exist.

- [ ] **Step 6: Commit**

```bash
cd "$WT" && direnv exec . npm run format && git add -A && git commit -m "feat(core): verification contract types, capability guards, hosted entry and error-code codegen"
```

---

### Task 5: `@blinkbitcoin/kyc-react-native` — placeholder library with the RN build pipeline

**Files:**
- Create: `packages/kyc-react-native/{tsconfig.json,tsconfig.build.json,babel.config.js,jest.config.js,Makefile,LICENSE,README.md}`
- Create: `packages/kyc-react-native/src/{index,hosted,packageInfo}.ts`, `packages/kyc-react-native/__mocks__/react-native-webview.tsx`, `packages/kyc-react-native/__mocks__/@react-native-community/netinfo.ts`
- Test: `packages/kyc-react-native/src/__tests__/packageInfo.test.ts`

**Interfaces:**
- Produces: `PACKAGE_NAME = '@blinkbitcoin/kyc-react-native'` and `describePackage()` from `.`; `./hosted` re-exports core's hosted surface. The demo (Task 8) renders `describePackage()`.

- [ ] **Step 1: Config + mocks**

```bash
mkdir -p "$WT/packages/kyc-react-native/src/__tests__" "$WT/packages/kyc-react-native/__mocks__/@react-native-community" && cd "$WT/packages/kyc-react-native"
cp "$ESIGN/packages/esign-react-native/tsconfig.build.json" "$ESIGN/packages/esign-react-native/babel.config.js" "$ESIGN/LICENSE" .
cp "$ESIGN/packages/esign-react-native/__mocks__/react-native-webview.tsx" __mocks__/
cp "$ESIGN/packages/esign-react-native/__mocks__/@react-native-community/netinfo.ts" __mocks__/@react-native-community/
```

`Makefile`: copy `$ESIGN/packages/esign-react-native/Makefile` (no esign references in it besides the help text; verify with `grep -n esign Makefile` → nothing, else sed `s/esign/kyc/g`).

`tsconfig.json`:
```json
{
  "extends": "@react-native/typescript-config",
  "compilerOptions": {
    "types": ["jest", "node"],
    "paths": {
      "@blinkbitcoin/kyc-core": ["../kyc-core/src/index.ts"],
      "@blinkbitcoin/kyc-core/hosted": ["../kyc-core/src/hosted.ts"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "__mocks__/**/*.ts", "__mocks__/**/*.tsx"],
  "exclude": ["node_modules", "lib"]
}
```

`jest.config.js`:
```js
module.exports = {
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/', '/lib/'],
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core/hosted$': '<rootDir>/../kyc-core/src/hosted.ts',
    '^@blinkbitcoin/kyc-core$': '<rootDir>/../kyc-core/src/index.ts',
    '^react-native-webview$': '<rootDir>/__mocks__/react-native-webview.tsx',
    '^@react-native-community/netinfo$':
      '<rootDir>/__mocks__/@react-native-community/netinfo.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@apollo/client|graphql|react-native-webview)/)',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/generated/',
    'src/types\\.ts$',
    'src/index\\.ts$',
    'src/hosted\\.ts$',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
```

`README.md`:
```markdown
# @blinkbitcoin/kyc-react-native

Identity-verification (KYC) flow component for React Native. Bootstrap
status: the package builds, publishes and re-exports `@blinkbitcoin/kyc-core`;
the `Verification` component, `useVerification` hook and the hardened hosted
WebView source arrive in the React Native phase (see
`docs/superpowers/specs/2026-09-05-kyc-design.md`).

Entry points: `@blinkbitcoin/kyc-react-native` (full) and
`@blinkbitcoin/kyc-react-native/hosted` (Apollo-free).
```

- [ ] **Step 2: Failing test**

`src/__tests__/packageInfo.test.ts`:
```ts
import { describePackage, PACKAGE_NAME } from '../packageInfo';

describe('packageInfo', () => {
  it('names the package', () => {
    expect(PACKAGE_NAME).toBe('@blinkbitcoin/kyc-react-native');
  });

  it('describes the package for a demo screen', () => {
    expect(describePackage()).toBe('@blinkbitcoin/kyc-react-native (bootstrap)');
  });
});
```

Run: `cd "$WT" && direnv exec . npm test -w packages/kyc-react-native`. Expected: FAIL (module not found).

- [ ] **Step 3: Implementation + entries**

`src/packageInfo.ts`:
```ts
// Bootstrap placeholder so the package has a covered module and the demo
// has something to render. Replaced by the Verification component.
export const PACKAGE_NAME = '@blinkbitcoin/kyc-react-native';

export const describePackage = (): string => `${PACKAGE_NAME} (bootstrap)`;
```

`src/index.ts`:
```ts
// @blinkbitcoin/kyc-react-native - React Native verification package.
export * from '@blinkbitcoin/kyc-core';
export { describePackage, PACKAGE_NAME } from './packageInfo';
```

`src/hosted.ts`:
```ts
// Apollo-free entry (hosted mode).
export * from '@blinkbitcoin/kyc-core/hosted';
export { describePackage, PACKAGE_NAME } from './packageInfo';
```

Run: `direnv exec . npm test -w packages/kyc-react-native -- --coverage && direnv exec . npm run typecheck -w packages/kyc-react-native && direnv exec . npm run build -w packages/kyc-react-native`. Expected: PASS, 100%, `lib/{commonjs,module,typescript}` produced by bob.

- [ ] **Step 4: Commit**

```bash
cd "$WT" && direnv exec . npm run format && git add -A && git commit -m "feat(rn): bootstrap the React Native package with the bob build pipeline"
```

---

### Task 6: `@blinkbitcoin/kyc-react` — placeholder web library

**Files:**
- Create: `packages/kyc-react/{tsconfig.json,tsup.config.ts,babel.config.js,jest.config.js,Makefile,LICENSE,README.md}`, `packages/kyc-react/src/{index,packageInfo}.ts`
- Test: `packages/kyc-react/src/__tests__/packageInfo.test.ts`

**Interfaces:**
- Produces: `PACKAGE_NAME = '@blinkbitcoin/kyc-react'`, `describePackage()`; re-exports core.

- [ ] **Step 1: Config**

```bash
mkdir -p "$WT/packages/kyc-react/src/__tests__" && cd "$WT/packages/kyc-react"
cp "$ESIGN/packages/esign-react/tsconfig.json" "$ESIGN/packages/esign-react/babel.config.js" "$ESIGN/packages/esign-react/Makefile" "$ESIGN/LICENSE" .
sed -i '' -e 's#@blinkbitcoin/esign-core#@blinkbitcoin/kyc-core#g; s#esign-core#kyc-core#g' tsconfig.json
```

`tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', '@apollo/client', 'graphql', '@blinkbitcoin/kyc-core'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
```

`jest.config.js`:
```js
module.exports = {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core$': '<rootDir>/../kyc-core/src/index.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  coveragePathIgnorePatterns: ['/node_modules/', 'src/generated/', 'src/types\\.ts$', 'src/index\\.ts$'],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
```

`README.md`:
```markdown
# @blinkbitcoin/kyc-react

Identity-verification (KYC) flow component for React web apps. Bootstrap
status: builds, publishes and re-exports `@blinkbitcoin/kyc-core`; the
`Verification` component, `useVerification` hook and the origin-pinned
hosted iframe source arrive in the web phase.
```

- [ ] **Step 2: Test, implementation, verify**

`src/__tests__/packageInfo.test.ts`:
```ts
import { describePackage, PACKAGE_NAME } from '../packageInfo';

describe('packageInfo', () => {
  it('names the package', () => {
    expect(PACKAGE_NAME).toBe('@blinkbitcoin/kyc-react');
  });

  it('describes the package for a demo page', () => {
    expect(describePackage()).toBe('@blinkbitcoin/kyc-react (bootstrap)');
  });
});
```

`src/packageInfo.ts`:
```ts
// Bootstrap placeholder; replaced by the Verification component.
export const PACKAGE_NAME = '@blinkbitcoin/kyc-react';

export const describePackage = (): string => `${PACKAGE_NAME} (bootstrap)`;
```

`src/index.ts`:
```ts
// @blinkbitcoin/kyc-react - React web verification package.
export * from '@blinkbitcoin/kyc-core';
export { describePackage, PACKAGE_NAME } from './packageInfo';
```

Run: `cd "$WT" && direnv exec . npm test -w packages/kyc-react -- --coverage && direnv exec . npm run typecheck -w packages/kyc-react && direnv exec . npm run build -w packages/kyc-react`. Expected: PASS, 100%, dist emitted.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(react): bootstrap the React web package with the tsup build"
```

---

### Task 7: `@blinkbitcoin/kyc-sumsub` — provider package skeleton with three entries

**Files:**
- Create: `packages/kyc-sumsub/{tsconfig.json,tsup.config.ts,babel.config.js,jest.config.js,Makefile,LICENSE,README.md}`, `packages/kyc-sumsub/src/{index,react-native,web,provider}.ts`
- Test: `packages/kyc-sumsub/src/__tests__/provider.test.ts`

**Interfaces:**
- Produces: `SUMSUB_PROVIDER = 'sumsub'` and `sumsubSession(fields)` (builds a `VerificationSession` with `provider: 'sumsub'`) from `.`; `./react-native` and `./web` re-export them (adapters land in the Sumsub phase).

- [ ] **Step 1: Config**

```bash
mkdir -p "$WT/packages/kyc-sumsub/src/__tests__" && cd "$WT/packages/kyc-sumsub"
cp "$ESIGN/packages/esign-core/babel.config.js" "$ESIGN/LICENSE" .
cp "$ESIGN/packages/esign-react/Makefile" Makefile
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "ignoreDeprecations": "6.0",
    "types": ["jest", "node"],
    "paths": {
      "@blinkbitcoin/kyc-core": ["../kyc-core/src/index.ts"],
      "@blinkbitcoin/kyc-core/hosted": ["../kyc-core/src/hosted.ts"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

`tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react-native.ts', 'src/web.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@blinkbitcoin/kyc-core',
    '@sumsub/react-native-mobilesdk-module',
    '@sumsub/websdk',
    'react-native',
  ],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
```

`jest.config.js`:
```js
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core/hosted$': '<rootDir>/../kyc-core/src/hosted.ts',
    '^@blinkbitcoin/kyc-core$': '<rootDir>/../kyc-core/src/index.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/index\\.ts$',
    'src/react-native\\.ts$',
    'src/web\\.ts$',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
```

`README.md`:
```markdown
# @blinkbitcoin/kyc-sumsub

Sumsub provider adapters for `@blinkbitcoin/kyc`. Three entries keep native
dependencies out of hosts that do not need them:

| Import | Contents | Peer needed |
|--------|----------|-------------|
| `@blinkbitcoin/kyc-sumsub` | Shared Sumsub ↔ normalized mapping (pure TS) | none |
| `@blinkbitcoin/kyc-sumsub/react-native` | `createSumsubNativeSource` over the Sumsub Mobile SDK | `@sumsub/react-native-mobilesdk-module` |
| `@blinkbitcoin/kyc-sumsub/web` | `createSumsubWebSource` over the Sumsub Web SDK | `@sumsub/websdk` |

Bootstrap status: the entries exist and publish; the adapters arrive in the
Sumsub phase.
```

- [ ] **Step 2: Test + implementation**

`src/__tests__/provider.test.ts`:
```ts
import { SUMSUB_PROVIDER, sumsubSession } from '../provider';

describe('sumsubSession', () => {
  it('tags a session with the sumsub provider id', () => {
    expect(SUMSUB_PROVIDER).toBe('sumsub');
    expect(sumsubSession({ accessToken: 't' })).toEqual({ provider: 'sumsub', accessToken: 't' });
  });

  it('never lets the caller override the provider id', () => {
    expect(sumsubSession({ provider: 'other', applicantId: 'a' } as never).provider).toBe('sumsub');
  });
});
```

`src/provider.ts`:
```ts
import type { VerificationSession } from '@blinkbitcoin/kyc-core/hosted';

export const SUMSUB_PROVIDER = 'sumsub' as const;

/** Build a VerificationSession that is always tagged as Sumsub. */
export const sumsubSession = (
  fields: Omit<VerificationSession, 'provider'>,
): VerificationSession => ({ ...fields, provider: SUMSUB_PROVIDER });
```

`src/index.ts`, `src/react-native.ts`, `src/web.ts` (all three, same one-liner with the entry named in a comment):
```ts
// @blinkbitcoin/kyc-sumsub - shared Sumsub mapping (pure TS, no native deps).
export { SUMSUB_PROVIDER, sumsubSession } from './provider';
```
(`react-native.ts` comment: `// @blinkbitcoin/kyc-sumsub/react-native - the native-SDK source lands here.`; `web.ts`: `// @blinkbitcoin/kyc-sumsub/web - the web-SDK source lands here.`)

Run: `cd "$WT" && direnv exec . npm test -w packages/kyc-sumsub -- --coverage && direnv exec . npm run typecheck -w packages/kyc-sumsub && direnv exec . npm run build -w packages/kyc-sumsub && direnv exec . npm run check:packages`. Expected: PASS, 100%, three dist entries, publint + attw clean for all packages.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(sumsub): bootstrap the provider package with root, react-native and web entries"
```

---

### Task 8: React Native demo — boots, renders the package, one Maestro flow

**Files:**
- Create (copied verbatim): `examples/react-native-demo/{ios,android,.bundle}/**`, `Gemfile`, `Gemfile.lock`, `app.json`, `index.js`, `metro.config.js`, `.watchmanconfig`, `Makefile`, `__mocks__/react-native-safe-area-context.tsx`
- Create: `examples/react-native-demo/{App.tsx,babel.config.js,jest.config.js,tsconfig.json,README.md}`, `src/config.ts`, `.maestro/{config.yaml,app-launch.yaml}`
- Test: `__tests__/App.test.tsx`, `src/__tests__/config.test.ts`

**Interfaces:**
- Consumes: `describePackage()` from `@blinkbitcoin/kyc-react-native`.
- Produces: an app whose first screen shows `testID="app-ready"` text `KYC demo` and `testID="package-name"` text from `describePackage()`; Maestro flow `app-launch` asserting both.

- [ ] **Step 1: Copy the native projects and static scaffolding**

```bash
mkdir -p "$WT/examples/react-native-demo" && cd "$WT/examples/react-native-demo"
for d in ios android .bundle __mocks__; do cp -R "$ESIGN/examples/react-native-demo/$d" .; done
rm -rf ios/Pods ios/build android/app/build android/.gradle
for f in Gemfile Gemfile.lock app.json index.js metro.config.js .watchmanconfig Makefile; do cp "$ESIGN/examples/react-native-demo/$f" .; done
sed -i '' -e 's#packages/esign-react-native#packages/kyc-react-native#' metro.config.js
grep -rn 'esign' ios/Podfile android/settings.gradle android/app/build.gradle Makefile || echo clean
```

Expected: `clean` (the native projects only know `ReactNativeSandbox` / `com.reactnativesandbox`, which stay).

- [ ] **Step 2: JS config files**

`babel.config.js`:
```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [['transform-inline-environment-variables', { include: ['KYC_MODE'] }]],
};
```

`tsconfig.json`:
```json
{
  "extends": "@react-native/typescript-config",
  "compilerOptions": {
    "types": ["jest"],
    "paths": {
      "@blinkbitcoin/kyc-react-native": ["../../packages/kyc-react-native/src"],
      "@blinkbitcoin/kyc-react-native/hosted": ["../../packages/kyc-react-native/src/hosted.ts"],
      "@blinkbitcoin/kyc-core": ["../../packages/kyc-core/src/index.ts"],
      "@blinkbitcoin/kyc-core/hosted": ["../../packages/kyc-core/src/hosted.ts"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "ios", "android", "vendor"]
}
```

`jest.config.js`:
```js
module.exports = {
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@apollo/client|graphql|react-native-webview)/)',
  ],
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core/hosted$': '<rootDir>/../../packages/kyc-core/src/hosted.ts',
    '^@blinkbitcoin/kyc-core$': '<rootDir>/../../packages/kyc-core/src/index.ts',
    '^@blinkbitcoin/kyc-react-native/hosted$':
      '<rootDir>/../../packages/kyc-react-native/src/hosted.ts',
    '^@blinkbitcoin/kyc-react-native$': '<rootDir>/../../packages/kyc-react-native/src/index.ts',
    '^react-native-webview$':
      '<rootDir>/../../packages/kyc-react-native/__mocks__/react-native-webview.tsx',
    '^@react-native-community/netinfo$':
      '<rootDir>/../../packages/kyc-react-native/__mocks__/@react-native-community/netinfo.ts',
    '^react-native-safe-area-context$': '<rootDir>/__mocks__/react-native-safe-area-context.tsx',
  },
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
};
```

`README.md`:
```markdown
# kyc-react-native-example

React Native 0.86 host for `@blinkbitcoin/kyc-react-native`: manual testing and
the Maestro E2E target. `KYC_MODE` (native | hosted | proxy | fake-native) is
inlined at bundle time by Babel. Bootstrap status: boots and shows the package
name; the verification screen lands with the React Native phase.

Run from the repo root: `make start`, then `make ios` / `make android`.
E2E: `make e2e-backend-up && make e2e-android` (see the root Makefile).
```

- [ ] **Step 3: Failing tests**

`src/__tests__/config.test.ts`:
```ts
import { Platform } from 'react-native';
import { getDevBackendHost, GRAPHQL_URL, KYC_MODE } from '../config';

describe('getDevBackendHost', () => {
  it('uses the emulator host alias on Android', () => {
    expect(getDevBackendHost('android')).toBe('10.0.2.2');
  });

  it('uses localhost on iOS', () => {
    expect(getDevBackendHost('ios')).toBe('localhost');
  });
});

describe('GRAPHQL_URL / KYC_MODE', () => {
  it('points at the backend GraphQL endpoint for the current platform', () => {
    expect(GRAPHQL_URL).toBe(`http://${getDevBackendHost(Platform.OS)}:4000/graphql`);
  });

  it('defaults the mode to native', () => {
    expect(KYC_MODE).toBe('native');
  });
});
```

`__tests__/App.test.tsx`:
```tsx
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import * as RN from 'react-native';
import App from '../App';

test('renders the ready marker and the package description', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(renderer!.root.findByProps({ testID: 'app-ready' }).props.children).toBe('KYC demo');
  expect(renderer!.root.findByProps({ testID: 'package-name' }).props.children).toBe(
    '@blinkbitcoin/kyc-react-native (bootstrap)',
  );
});

test('uses a light-content status bar in dark mode', async () => {
  const spy = jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(renderer!.root.findByType(RN.StatusBar).props.barStyle).toBe('light-content');
  spy.mockRestore();
});
```

Run: `cd "$WT" && direnv exec . npm test -w examples/react-native-demo`. Expected: FAIL (modules not found).

- [ ] **Step 4: `src/config.ts` and `App.tsx`**

`src/config.ts`:
```ts
import { Platform } from 'react-native';

declare const process: { env: { KYC_MODE?: string } };

const BACKEND_PORT = 4000;

export const getDevBackendHost = (platformOs: string): string =>
  platformOs === 'android' ? '10.0.2.2' : 'localhost';

const backendOrigin = `http://${getDevBackendHost(Platform.OS)}:${BACKEND_PORT}`;

export const GRAPHQL_URL = `${backendOrigin}/graphql`;

export type KycMode = 'native' | 'hosted' | 'proxy' | 'fake-native';

const MODE = process.env.KYC_MODE;
export const KYC_MODE: KycMode =
  MODE === 'hosted' || MODE === 'proxy' || MODE === 'fake-native' ? MODE : 'native';
```

`App.tsx`:
```tsx
/**
 * Demo host for @blinkbitcoin/kyc-react-native. Bootstrap: shows that the
 * package resolves through the workspace; the verification screen lands
 * with the React Native phase.
 *
 * @format
 */

import { describePackage } from '@blinkbitcoin/kyc-react-native';
import { StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { KYC_MODE } from './src/config';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title} testID="app-ready">
        KYC demo
      </Text>
      <Text style={styles.body} testID="package-name">
        {describePackage()}
      </Text>
      <Text style={styles.body} testID="kyc-mode">
        {`mode: ${KYC_MODE}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 15, marginBottom: 4 },
});

export default App;
```

Run: `direnv exec . npm test -w examples/react-native-demo -- --coverage && direnv exec . npm run typecheck -w examples/react-native-demo`. Expected: PASS.

- [ ] **Step 5: Maestro flow**

`.maestro/config.yaml`:
```yaml
# Maestro workspace config. app-launch is the boot smoke and, once more flows
# exist, the ONLY flow that launches the app (see esign for the rationale).
executionOrder:
  flowsOrder:
    - app-launch
```

`.maestro/app-launch.yaml`:
```yaml
# Maestro E2E: launch smoke test - the app boots and the workspace package
# resolves. Fast-fail signal for broken builds.
appId: ${APP_ID} # iOS: org.reactjs.native.example.ReactNativeSandbox / Android: com.reactnativesandbox
---
- retry:
    maxRetries: 2
    commands:
      - launchApp
      - extendedWaitUntil:
          visible:
            id: "app-ready"
          timeout: 60000
      - assertVisible: "KYC demo"
      - assertVisible:
          id: "package-name"
```

Local check (optional, needs an emulator): `cd "$WT" && direnv exec . make e2e-backend-up && cd examples/react-native-demo/android && ./gradlew assembleDebug && cd "$WT" && direnv exec . make e2e-android`. CI runs it regardless in Task 11.

- [ ] **Step 6: Commit**

```bash
cd "$WT" && direnv exec . npm run format && git add -A && git commit -m "feat(demo): bootstrap the React Native demo with a launch Maestro flow"
```

---

### Task 9: Web demo — Vite app, unit test, one Playwright spec

**Files:**
- Create: `examples/react-demo/{index.html,vite.config.ts,tsconfig.json,playwright.config.ts,Makefile,README.md}`, `src/{main.tsx,App.tsx,config.ts,vite-env.d.ts}`
- Test: `src/__tests__/App.test.tsx`, `e2e/launch.spec.ts`

**Interfaces:**
- Consumes: `describePackage()` from `@blinkbitcoin/kyc-react`; backend `GET /health` (Playwright `webServer`).
- Produces: page with `data-testid="app-ready"` heading `KYC demo` and `data-testid="package-name"`.

- [ ] **Step 1: Config files**

```bash
mkdir -p "$WT/examples/react-demo/src/__tests__" "$WT/examples/react-demo/e2e" && cd "$WT/examples/react-demo"
cp "$ESIGN/examples/react-demo/Makefile" "$ESIGN/examples/react-demo/src/vite-env.d.ts" .
mv vite-env.d.ts src/
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>kyc-react demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@blinkbitcoin/kyc-react': path.resolve(__dirname, '../../packages/kyc-react/src/index.ts'),
      '@blinkbitcoin/kyc-core/hosted': path.resolve(__dirname, '../../packages/kyc-core/src/hosted.ts'),
      '@blinkbitcoin/kyc-core': path.resolve(__dirname, '../../packages/kyc-core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "types": ["vitest/globals"],
    "paths": {
      "@blinkbitcoin/kyc-react": ["../../packages/kyc-react/src"],
      "@blinkbitcoin/kyc-core": ["../../packages/kyc-core/src/index.ts"],
      "@blinkbitcoin/kyc-core/hosted": ["../../packages/kyc-core/src/hosted.ts"]
    }
  },
  "include": ["src", "e2e", "playwright.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 0,
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    {
      command: 'KYC_PROVIDER=mock npx dotenv-cli -e apps/api/.env.test -- npm run dev -w apps/api',
      cwd: '../..',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
```

`README.md`:
```markdown
# kyc-react-example

Vite + React 19 host for `@blinkbitcoin/kyc-react`: manual testing and the
Playwright E2E target. `VITE_KYC_MODE` (hosted | proxy) selects the mode.
Bootstrap status: renders the package name; the verification flow lands with
the web phase. Run from the repo root: `make web`; E2E: `make e2e-web`.
```

- [ ] **Step 2: Failing tests**

`src/__tests__/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { App } from '../App';

describe('demo App', () => {
  it('renders the ready heading and the package description', () => {
    render(<App />);
    expect(screen.getByTestId('app-ready').textContent).toBe('KYC demo');
    expect(screen.getByTestId('package-name').textContent).toBe('@blinkbitcoin/kyc-react (bootstrap)');
    expect(screen.getByTestId('kyc-mode').textContent).toBe('mode: hosted');
  });
});
```

`e2e/launch.spec.ts`:
```ts
// Browser E2E smoke: Vite serves the demo, the workspace package resolves,
// and the backend (mock provider) answers /health behind it.

import { test, expect } from '@playwright/test';

test('launch smoke: demo boots and the backend is healthy', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByTestId('app-ready')).toHaveText('KYC demo');
  await expect(page.getByTestId('package-name')).toContainText('@blinkbitcoin/kyc-react');
  const health = await request.get('http://localhost:4000/health');
  expect(health.ok()).toBe(true);
  expect((await health.json()).status).toBe('ok');
});
```

Run: `cd "$WT" && direnv exec . npm test -w examples/react-demo`. Expected: FAIL (App missing).

- [ ] **Step 3: App files**

`src/config.ts`:
```ts
export const API_ORIGIN = 'http://localhost:4000';
export const GRAPHQL_URL = `${API_ORIGIN}/graphql`;

export type KycMode = 'hosted' | 'proxy';

const MODE = import.meta.env.VITE_KYC_MODE;
export const KYC_MODE: KycMode = MODE === 'proxy' ? 'proxy' : 'hosted';
```

`src/App.tsx`:
```tsx
// Demo host for the @blinkbitcoin/kyc-react web package. Bootstrap: proves
// the workspace wiring; the verification flow lands with the web phase.
import { describePackage } from '@blinkbitcoin/kyc-react';

import { KYC_MODE } from './config';

export const App = () => (
  <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
    <h1 data-testid="app-ready">KYC demo</h1>
    <p data-testid="package-name">{describePackage()}</p>
    <p data-testid="kyc-mode">{`mode: ${KYC_MODE}`}</p>
  </main>
);
```

`src/main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Run: `direnv exec . npm test -w examples/react-demo -- --coverage && direnv exec . npm run typecheck -w examples/react-demo && direnv exec . npx playwright install chromium && direnv exec . make e2e-web`. Expected: unit PASS; Playwright starts backend + Vite and the spec passes (needs Docker for the test DB).

- [ ] **Step 4: Commit**

```bash
cd "$WT" && direnv exec . npm run format && git add -A && git commit -m "feat(demo): bootstrap the web demo with a launch Playwright spec"
```

---

### Task 10: Scripts, workflows, docs and agent guidance renamed for kyc

**Files:**
- Modify: `scripts/pack-smoke.sh`, `scripts/release/registry-smoke.sh`, `scripts/release/registry-smoke-assert.cjs`, `scripts/release/resolve-version.sh`, `scripts/coverage-badge.mjs`, `scripts/assemble-diagrams.mjs`, `.github/workflows/ci.yml`
- Create: `README.md` (replace the auto-generated one), `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/index.md`, `docs/development-guide.md`, `docs/diagrams/src/system-architecture.mmd`, `docs/diagrams/dist/system-architecture.svg` (generated), `docs/diagrams/README.md` (generated), `docs/assets/readme-hero.svg`, `packages/README.md`, `apps/README.md`, `examples/README.md`, `.claude/skills/regenerate-mermaid-diagrams/SKILL.md`

- [ ] **Step 1: `scripts/pack-smoke.sh`**

```bash
set -euo pipefail
SMOKE="$(mktemp -d)"
trap 'rm -rf "$SMOKE"' EXIT

for p in packages/kyc-core packages/kyc-sumsub packages/kyc-react-native packages/kyc-react; do
  (cd "$p" && npm pack --pack-destination "$SMOKE" >/dev/null)
done

cd "$SMOKE"
npm init -y >/dev/null
npm install --no-save ./blinkbitcoin-kyc-core-*.tgz >/dev/null
npm install --no-save ./blinkbitcoin-kyc-sumsub-*.tgz ./blinkbitcoin-kyc-react-native-*.tgz ./blinkbitcoin-kyc-react-*.tgz >/dev/null 2>&1 || true

node - <<'NODE'
const assert = require('node:assert');
const hosted = require('@blinkbitcoin/kyc-core/hosted');
assert.equal(typeof hosted.isLaunchable, 'function');
assert.equal(typeof hosted.isTokenRefreshable, 'function');
let apolloInstalled = false;
try { require.resolve('@apollo/client'); apolloInstalled = true; } catch {}
assert.equal(apolloInstalled, false, '@apollo/client must NOT be installed for hosted-only use');
const loaded = Object.keys(require.cache).filter((f) => /node_modules[\\/](@apollo|graphql)/.test(f));
assert.deepEqual(loaded, [], '/hosted must not load Apollo or graphql');
console.log('pack smoke: /hosted resolves Apollo-free');
NODE
NODE_OPTIONS="" node --input-type=module -e "
import { isLaunchable } from '@blinkbitcoin/kyc-core/hosted';
if (typeof isLaunchable !== 'function') process.exit(1);
console.log('pack smoke: ESM import of /hosted works');
"
echo "PACK SMOKE PASSED"
```

Run: `cd "$WT" && direnv exec . npm run build && direnv exec . bash scripts/pack-smoke.sh`. Expected: `PACK SMOKE PASSED`.

- [ ] **Step 2: Registry smoke + version resolution**

`scripts/release/registry-smoke.sh`: replace every `@blinkbitcoin/esign-core` with `@blinkbitcoin/kyc-core` (three occurrences).

`scripts/release/registry-smoke-assert.cjs`:
```js
const assert = require('node:assert');
const path = require('node:path');
const { createRequire } = require('node:module');

const consumer = createRequire(path.join(process.cwd(), 'package.json'));

const mode = process.argv[2];
if (mode === 'default') {
  const hosted = consumer('@blinkbitcoin/kyc-core/hosted');
  assert.equal(typeof hosted.isLaunchable, 'function');
  assert.equal(typeof hosted.isTokenRefreshable, 'function');
  const loaded = Object.keys(require.cache).filter((f) => /node_modules[\\/](@apollo|graphql)/.test(f));
  assert.deepEqual(loaded, [], '/hosted must not load Apollo or graphql');
  console.log('verify: /hosted loads Apollo-free for', process.env.VERSION);
} else if (mode === 'lean') {
  consumer('@blinkbitcoin/kyc-core/hosted');
  let apollo = false;
  try { consumer.resolve('@apollo/client'); apollo = true; } catch {}
  assert.equal(apollo, false, '--omit=peer install must not contain Apollo');
  console.log('verify: --omit=peer install is Apollo-free');
} else {
  console.error('usage: registry-smoke-assert.cjs <default|lean>');
  process.exit(2);
}
```

`scripts/release/resolve-version.sh`: replace the `if [ -z "${DRY_RUN:-}" ]; then ... fi` block with:
```bash
if [ -z "${DRY_RUN:-}" ]; then
  for p in packages/kyc-core packages/kyc-sumsub packages/kyc-react-native packages/kyc-react; do
    (cd "$p" && npm pkg set version="$VERSION")
  done
  for p in packages/kyc-sumsub packages/kyc-react-native packages/kyc-react; do
    (cd "$p" && npm pkg set "dependencies.@blinkbitcoin/kyc-core=$VERSION")
  done
fi
```

`scripts/coverage-badge.mjs`: set `WORKSPACES` to `['packages/kyc-core', 'packages/kyc-sumsub', 'packages/kyc-react-native', 'packages/kyc-react', 'apps/api']` and replace `esign coverage` with `kyc coverage` in the HTML title.

Run: `DRY_RUN=1 bash scripts/release/resolve-version.sh && grep -rn esign scripts` → prints the version line and then nothing.

- [ ] **Step 3: `ci.yml` publish steps**

Replace the three `Publish @blinkbitcoin/esign-*` steps with:
```yaml
      - name: Publish @blinkbitcoin/kyc-core
        run: npm publish -w packages/kyc-core --tag ${{ steps.ver.outputs.disttag }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish @blinkbitcoin/kyc-sumsub
        run: npm publish -w packages/kyc-sumsub --tag ${{ steps.ver.outputs.disttag }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish @blinkbitcoin/kyc-react-native
        run: npm publish -w packages/kyc-react-native --tag ${{ steps.ver.outputs.disttag }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish @blinkbitcoin/kyc-react
        run: npm publish -w packages/kyc-react --tag ${{ steps.ver.outputs.disttag }}
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
Also in `ci.yml`: `Either way the three packages get the same version` → `Either way the four packages get the same version`; in the `registry-smoke` job comment replace `/webform` with `/hosted` (two occurrences) and `webform-only` with `hosted-only`. In `checks.yml` rename the step `Pack + install smoke (webform Apollo-free boundary)` to `Pack + install smoke (hosted Apollo-free boundary)`.

Run: `cd "$WT" && direnv exec . make check-ci`. Expected: actionlint + shellcheck clean.

- [ ] **Step 4: Diagram source, assembler, hero**

`docs/diagrams/src/system-architecture.mmd`:
```mermaid
flowchart TB
  subgraph host["Your app"]
    RN["@blinkbitcoin/kyc-react-native<br/>Verification + useVerification"]
    WEB["@blinkbitcoin/kyc-react<br/>Verification + useVerification"]
  end
  CORE["@blinkbitcoin/kyc-core<br/>VerificationSource + guards + bridge + ErrorCode"]
  SUMSUB["@blinkbitcoin/kyc-sumsub<br/>mapping · /react-native · /web"]
  API["apps/api<br/>VerificationProvider port · mock · sumsub<br/>/graphql · /webhook/kyc/:provider · /hosted/:sessionId"]
  PROVIDER["Sumsub"]
  RN --> CORE
  WEB --> CORE
  RN -- "mode 1: native SDK" --> SUMSUB
  WEB -- "mode 1: web SDK (follow-up)" --> SUMSUB
  RN -- "mode 2: hosted page (WebView)" --> API
  WEB -- "mode 2: hosted page (iframe)" --> API
  RN -- "mode 3: proxy (Apollo)" --> API
  WEB -- "mode 3: proxy (Apollo)" --> API
  SUMSUB --> PROVIDER
  API --> SUMSUB
  API --> PROVIDER
  style CORE fill:#e7f5ff
  style API fill:#fff3bf
```

`scripts/assemble-diagrams.mjs`: set `SECTIONS` to:
```js
const SECTIONS = [
  {
    file: 'system-architecture.mmd',
    title: 'System Architecture',
    outro:
      'Mode 1 runs the provider SDK in-process (host supplies the access token);\n' +
      'mode 2 embeds a hosted page speaking the `kyc-bridge` protocol; mode 3 adds\n' +
      'the proxy GraphQL session on `apps/api`. Only the proxy source loads Apollo.',
  },
];
```

`docs/assets/readme-hero.svg`: copy `$ESIGN/docs/assets/readme-hero.svg` as a temporary hero (it is decorative and replaced in the docs phase); note this in the README alt text: `alt="Architecture hero (placeholder from esign until the docs phase)"`.

Run: `cd "$WT" && direnv exec . make diagrams && direnv exec . make diagrams-check`. Expected: `docs/diagrams/dist/system-architecture.svg` + `docs/diagrams/README.md` generated, check passes.

- [ ] **Step 5: README, docs index, development guide**

`README.md` (replaces the `--add-readme` stub):
```markdown
# kyc

[![Unit](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/unit.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![E2E](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/e2e.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![Coverage](https://github.com/blinkbitcoin/kyc/raw/gh-pages/badges/main/coverage.svg)](https://github.com/blinkbitcoin/kyc/actions/workflows/ci.yml?query=branch%3Amain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

<sub>E2E covers backend, web and Android; the iOS simulator suite is opt-in (macOS runners), see [CI/CD](docs/development-guide.md#ios-e2e-is-opt-in).</sub>

Embedded identity verification (KYC) for React Native and React web apps.
One `Verification` component, provider-agnostic; Sumsub is the default
provider. **Status: bootstrap** — the packages build and publish, the
pipeline is green, and the verification flow lands phase by phase
(see [the design](docs/superpowers/specs/2026-09-05-kyc-design.md)).

| Mode | What it is | What your app installs | Backend required |
|------|-----------|------------------------|------------------|
| **1. Native / Web SDK** | The provider SDK runs in-process (RN native module on mobile, web SDK on web); your app supplies an access-token callback | `kyc-react-native` (or `kyc-react`) + `kyc-sumsub` + the Sumsub SDK peer | Any backend that mints provider access tokens (or this repo's `apps/api`) |
| **2. Hosted page** | The provider web SDK on a page served by `apps/api` (or any page speaking the bridge protocol), embedded in a hardened WebView / origin-pinned iframe | One package via the Apollo-free `/hosted` entry | The hosted page (this repo's `apps/api`, or your own) |
| **3. Proxy session** | Full orchestration: session creation, token refresh, webhook status sync, status query | The package + `@apollo/client` + `graphql` | This repo's backend service (`apps/api`) |

## Repository layout

| Path | Role |
|------|------|
| `packages/kyc-core` | Platform-agnostic core: `VerificationSource` + capability guards, bridge protocol, `ErrorCode` contract |
| `packages/kyc-react-native` | React Native `Verification` component + `useVerification` (hardened WebView for hosted mode) |
| `packages/kyc-react` | React web `Verification` component + `useVerification` (iframe for hosted mode) |
| `packages/kyc-sumsub` | Sumsub adapters: shared mapping, `/react-native` (native SDK), `/web` (web SDK) |
| `apps/api` | Reference backend: provider port, mock + Sumsub adapters, webhook, hosted page |
| `examples/react-native-demo`, `examples/react-demo` | Demo hosts (Maestro / Playwright E2E targets) |

## Development

`make help` lists every target. The ones that matter most: `make install`,
`make test`, `make coverage`, `make check-ci`, `make codegen`, `make diagrams`,
`make e2e-backend`, `make e2e-web`, `make e2e-android`. Full guide:
[docs/development-guide.md](docs/development-guide.md); conventions:
[CONTRIBUTING.md](CONTRIBUTING.md); docs map: [docs/index.md](docs/index.md).

Built the way [blinkbitcoin/esign](https://github.com/blinkbitcoin/esign) was.
```

`docs/index.md`:
```markdown
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
```

`docs/development-guide.md`: copy `$ESIGN/docs/development-guide.md`, then `sed -i '' -e 's/\*\*Project:\*\* esign/**Project:** kyc/; s/\*\*Updated:\*\* 2026-07-02/**Updated:** 2026-09-05/; s#cd esign#cd kyc#; s/esign-core/kyc-core/g; s/esign-react-native/kyc-react-native/g; s/esign-react/kyc-react/g; s/ESIGN_PROVIDER/KYC_PROVIDER/g; s/ESIGN_MODE/KYC_MODE/g; s/esign_test/kyc_test/g; s/DocuSign/the provider/g; s/docusign/sumsub/g; s#/webform#/hosted#g; s/ESignature/Verification/g; s/e-signature/identity verification/g; s/E-signature/Identity verification/g' docs/development-guide.md`, then read it top to bottom and delete any paragraph that describes an esign-only feature (Web Forms, envelopes, live DocuSign tests, `make test-live`, the `e2e-web-webform`/`e2e-web-publicurl` targets). Add `- Sumsub sandbox credentials are only needed once the Sumsub adapter lands.` under Prerequisites.

- [ ] **Step 6: Agent guidance and policy docs**

`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`: copy from `$ESIGN` and apply the same sed as in Step 5 plus `s#ESignProvider#VerificationProvider#g; s#providers/docusign/#providers/sumsub/#g; s#SigningSource#VerificationSource#g; s#createProxySigningSource / createWebFormsSource / createPublicUrlSource#createProxySource / createHostedSource / createSumsubNativeSource#; s#esign-<topic>#kyc-<topic>#g`. Then:
- In the scope tables/lists of `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` add `sumsub` (`packages/kyc-sumsub`) after `react`.
- In `CLAUDE.md`'s workspace table add the row `| \`@blinkbitcoin/kyc-sumsub\` | \`packages/kyc-sumsub/\` | Sumsub adapters: shared mapping + \`/react-native\` + \`/web\` entries |` and delete rows/lines about Web Forms, envelopes, `test:live`.
- `AGENTS.md` project tree: replace the `packages/` block with `kyc-core/`, `kyc-sumsub/`, `kyc-react-native/`, `kyc-react/` lines and the descriptions from the README layout table.
- `SECURITY.md` scope: `@blinkbitcoin/kyc-core`, `@blinkbitcoin/kyc-sumsub`, `@blinkbitcoin/kyc-react-native`, `@blinkbitcoin/kyc-react`; the security-model paragraph points at `docs/superpowers/specs/2026-09-05-kyc-design.md` until `docs/architecture/security.md` exists.
- `CONTRIBUTING.md` example commits: `feat(rn): expose onStatusChange on Verification`, `fix(api): reject webhook replays that downgrade a terminal session`, `feat(sumsub): map applicantReviewed to the normalized status`.

`packages/README.md`, `apps/README.md`, `examples/README.md`: copy from `$ESIGN` and apply the Step 5 sed; add a `kyc-sumsub` row to `packages/README.md` mirroring the README layout table.

`.claude/skills/regenerate-mermaid-diagrams/SKILL.md`: copy from `$ESIGN`, apply the Step 5 sed, replace the eight-row table with one row `| 1 | System Architecture | \`flowchart TB\` | \`README.md\` (modes) + the design spec | combined page only |`, set "(currently 8)" to "(currently 1)", and replace the event-vocabulary bullet with `Use the real normalized names from packages/kyc-core/src/verification/types.ts (applicantLoaded, submitted, statusChanged, complete, cancel, tokenExpired, sessionExpired, error).`

Verify: `cd "$WT" && grep -rniE 'esign|docusign|envelope|webform' --exclude-dir=node_modules --exclude-dir=.git --exclude=package-lock.json --exclude='readme-hero.svg' --exclude-dir=superpowers . | grep -v 'Built the way\|blinkbitcoin/esign\|from esign'` prints nothing (the allowed mentions are the README credit line and the "copied from esign" notes).

- [ ] **Step 7: Commit**

```bash
cd "$WT" && direnv exec . npm run format && git add -A && git commit -m "docs: README, docs index, agent guidance and CI scripts for the kyc packages"
```

---

### Task 11: Full local gate, push, PR, and a green pipeline

**Files:**
- Modify: whatever the gates flag (fix forward, one commit per fix, conventional scope)

- [ ] **Step 1: Run every gate CI runs, locally**

```bash
cd "$WT"
direnv exec . make test            # unit + lint + typecheck + format check
direnv exec . make coverage        # 100% on the four packages + api; 80% floors on demos
direnv exec . npm run build && direnv exec . npm run check:packages && direnv exec . bash scripts/pack-smoke.sh
direnv exec . make check-ci        # actionlint + shellcheck
direnv exec . make codegen-check   # schema.graphql + generated code current
direnv exec . make diagrams-check
direnv exec . make docs-check
direnv exec . make e2e-backend
direnv exec . make e2e-web
direnv exec . npx audit-ci --config audit-ci.jsonc
git log --oneline origin/main..HEAD | cat && direnv exec . npx commitlint --from origin/main --to HEAD --verbose
```

Expected: every command exits 0. Fix any failure in place and commit it (`fix(ci): ...`, `fix(demo): ...` etc.); never lower a threshold.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin chore/bootstrap
gh pr create --repo blinkbitcoin/kyc --base main --head chore/bootstrap \
  --title "chore: bootstrap the kyc monorepo from the esign layout" \
  --body "$(cat <<'EOF'
## Summary

Stands up `blinkbitcoin/kyc` with esign's tooling, CI/CD and docs skeleton, and the smallest real slice of each workspace so every pipeline stage runs green:

- `packages/kyc-core`: `VerificationSource` contract + capability guards, Apollo-free `/hosted` entry (guard-tested), `ErrorCode` wire contract generated from `apps/api/schema.graphql`
- `packages/kyc-sumsub`: root / `react-native` / `web` entries (adapters follow)
- `packages/kyc-react-native`, `packages/kyc-react`: build + publish pipelines (bob / tsup), placeholders until their component phases
- `apps/api`: health-only Express 5 + Apollo 5 backend, fail-closed security config (`JWT_SECRET`, `SUMSUB_WEBHOOK_SECRET` for `KYC_PROVIDER=sumsub`), first Knex migration (`VerificationSession`, `AuditLog`), backend E2E
- Demos: RN 0.86 (Maestro launch flow) and Vite (Playwright launch spec)
- CI: Checks → Unit → E2E (Backend, Web, Android; iOS opt-in) → Badges → Publish `next` → Verify, CodeQL, commitlint, release retry

Design: `docs/superpowers/specs/2026-09-05-kyc-design.md`. Plan: `docs/superpowers/plans/2026-09-05-kyc-bootstrap.md`.

## Test plan

- [ ] `make test`, `make coverage` (100% packages + api)
- [ ] `make e2e-backend`, `make e2e-web`
- [ ] CI green on this PR including Android E2E
- [ ] After merge: `next` prerelease published for all four packages; Verify job green
EOF
)"
```

- [ ] **Step 3: Watch the pipeline and fix forward**

```bash
gh pr checks --repo blinkbitcoin/kyc chore/bootstrap --watch
```

Expected: `Checks / Changes, Code, Packages, Commits, Docs`, `Unit / Coverage`, `E2E / Backend, Web, Build Android, Android`, `Badges` all green; `CodeQL / Analyze` green. If a job fails: read the log with `gh run view <id> --log-failed`, fix locally, run the matching local gate from Step 1, commit with a conventional message, push, re-watch. Known first-run items: the Android emulator caches are cold (expect ~25 min); `Badges` creates the `gh-pages` branch on first run.

- [ ] **Step 4: Hand off**

Post the PR link to the user. Merge needs an approving review under the org ruleset; after the squash merge the push-to-main run publishes `0.0.1-pre.<run>.<sha>` under `next` for all four packages and the Verify job installs `@blinkbitcoin/kyc-core@<that version>` from GitHub Packages. Then remove the worktree: `cd "$KYC" && git worktree remove ../kyc-bootstrap && git fetch --prune`.

Phase 2 (`feat(core)`: types are already here; add `createProxySource`, the Apollo client factory, the bridge protocol and client-side error codes) gets its own plan from the spec.
