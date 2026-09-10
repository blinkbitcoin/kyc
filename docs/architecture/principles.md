# Principles

The rules this repository is built on, each with the reason it exists in a
KYC library and the check that enforces it. AGENTS.md states the rules;
this page says why.

## Provider containment

Nothing Sumsub-specific lives outside a `providers/sumsub/` directory - in
core (the one status mapping), the server (the adapter, its client, its
page), React Native (the native-SDK source) and the web package (the
reserved seat). A package's `src/sumsub.ts` is a one-line re-export of that
directory; generic layers never import a provider; a backend selects one
through a registry keyed by `KYC_PROVIDER`.

**Why:** the app never learns a provider name, so a second provider - or a
Sumsub API change - is a directory, not a rewrite.
**Enforced by:** the `sumsub-entry` / `provider-boundary` guard tests (an
import-graph walk from every entry), the "nothing outside `providers/`
names Sumsub" assertion in the server package, `scripts/pack-smoke.sh`.

## Apollo containment

`/hosted`, `/testing` and `/sumsub` never reach `@apollo/client` or
`graphql`; only the package roots do, for proxy mode.

**Why:** modes 1 and 2 must install without GraphQL peers - a host with its
own API (Blink) never wants a second client stack.
**Enforced by:** the `hosted-entry` walks (into core's source, on every
platform), `scripts/pack-smoke.sh` on the packed tarballs (`require.cache`
must hold no Apollo after loading the entries), the optional-peer contract.

## One state machine, in core

`machineReducer` / `planEvent` in `packages/kyc-core/src/verification/machine.ts`
are the only place a client-side transition exists; the React Native and
web hooks execute the effects it describes.

**Why:** two platforms, one behaviour - a camera-permission edge case fixed
on iOS is fixed on the web in the same commit.
**Enforced by:** the machine's own tests in core; the platform tests assert
the hooks over the shared reducer, never a second one.

## One write path, on the server

`applyStatusTransition` in `packages/kyc-server/src/sessions.ts` is the only
caller of the store's conditional `updateSessionStatus`; the terminal guard
(`WHERE status NOT IN (approved, finallyRejected)`) is part of the `UPDATE`.

**Why:** a replayed or late webhook must never downgrade an approved user,
whatever path it arrives on (webhook, status reconciliation, a future admin
action).
**Enforced by:** `single-write-path.test.ts`, the Knex store's SQL tests,
the E2E webhook suite on a real Postgres.

## Resolvers and routes map I/O only

`createKycGraphQL` and `createKycRouter` translate transport to the
service's methods and back; every rule (ownership, persist-first,
reconciliation, the webhook outcomes) is in `createVerificationService`.

**Why:** a host mounting the Fetch handlers, the router or its own
resolvers gets identical behaviour.
**Enforced by:** the service tests over fakes; the handler and router tests
only check the mapping.

## Hosts own copy and styling

Every string the default UI renders is a `IdentityVerificationLabels` key and
every color a `IdentityVerificationTheme` key; a host that wants another layout
calls `useIdentityVerification`.

**Why:** Blink is multilingual and branded; hard-coded English and iOS blue
would not ship.
**Enforced by:** the theme tests (every key overridable, `undefined` keeps
the default), the component tests rendering host copy, the themed demo
variants.

## Generated artifacts are never hand-edited

`schema.graphql`, `packages/kyc-core/src/generated/`, `docs/diagrams/dist/*.svg`,
`docs/diagrams/README.md`, the badges.

**Why:** the wire contract and the pictures must match the code they
describe, and drift is invisible by eye.
**Enforced by:** `make codegen-check`, `make diagrams-check`, the
`schema-artifact` and wire-contract tests, CI's Checks stage.

## Code and its doc move together

An architecture change without a `docs/` change fails CI; a `package.json`
change counts only when it is structural (exports, scripts, workspaces),
and Dependabot is exempt. README table cells stay under 72 characters.

**Why:** the docs are the current state, not a changelog - a stale doc is
worse than none.
**Enforced by:** `scripts/ci/docs-freshness.sh` + `manifest-structural.mjs`,
`scripts/ci/docs-tables.mjs` (`make docs-check`).

## 100% coverage, and no empty rows

Every package, the reference backend, the access-token example, both client
demos and `scripts/lib` enforce 100% statements, branches, functions and
lines; a re-export or type-only module is excluded rather than counted at
0%.

**Why:** a coverage floor below 100 drifts down one "acceptable" gap at a
time; an empty row hides a module that should have been excluded or tested.
**Enforced by:** the thresholds in every Jest/Vitest config,
`scripts/ci/coverage-empty.mjs` (`make coverage`).

## Sumsub semantics live in one place, and are verified against the sandbox

`packages/kyc-core/src/providers/sumsub/mapping.ts` is the only
implementation of the status, webhook and event tables; the hosted page
embeds a table generated from it; the server adapter imports it. What can
run against the real sandbox API does, opt-in (`make e2e-live`); the device
matrix is a written, repeatable manual pass.

**Why:** the provider's vocabulary is the risk this library carries -
`completed` + `RED` + `FINAL` must mean the same thing on the phone, on the
page and in the database, and only Sumsub can confirm the contract.
**Enforced by:** the full-vocabulary equality test between the page's table
and `mapSumsubStatus`, the provider-boundary guard, the live tier
(`docs/operations/live-e2e-ci.md`), `docs/integration/sumsub.md`.

## Conventions are gates, not memory

A convention that had to be corrected twice becomes a check: the README
table width, the empty coverage row, the structural-manifest rule, the
bounded Maestro step, the published-package list checked against the
manifests, the commit scopes.

**Why:** several people and several agent sessions work here; a rule only
holds if a machine holds it.
**Enforced by:** `scripts/ci/*`, `scripts/lib/*.test.mjs`, commitlint,
lefthook, the Checks stage.
