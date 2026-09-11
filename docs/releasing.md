# Releasing

**Updated:** 2026-09-07

How a change goes from a merged PR to a version on GitHub Packages, and the
one thing a human does along the way: merge the release PR.

## The short version

1. Merge PRs to `main` as usual. Every PR title is a Conventional Commit
   (commitlint enforces it); the squash merge makes that title the commit.
2. Each push to `main` publishes a prerelease under the `next` dist-tag,
   as before.
3. When a `feat:`, `fix:`, `perf:` or `revert:` commit reaches `main`,
   release-please opens (or updates) one pull request titled
   `chore(release): X.Y.Z`. It carries the next version and the changelog
   entry for everything since the last release.
4. Approve it and merge it: `make release`, or the Merge button. That is the
   release. release-please tags `vX.Y.Z`, creates the GitHub Release with the
   changelog entry as its body, and starts the release run of `ci.yml`, which
   stamps the version into the five packages, runs the full gate, waits for
   the commit's main run to be green, and publishes under `latest`.

Nothing else is edited by hand. `package.json` in the five publishable
packages stays at `0.0.0-development`; the root `package.json` carries the
released version because release-please maintains it.

## How the version is chosen

release-please reads the commits since the last `v*` tag:

| Commits since the last release | Bump (while < 1.0.0) | Bump (from 1.0.0) |
|---|---|---|
| only `ci:`, `docs:`, `chore:`, `build:`, `refactor:`, `test:`, `style:` | none: no release PR | none |
| at least one `fix:` / `perf:` / `revert:` | patch | patch |
| at least one `feat:` | minor | minor |
| `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer | minor | major |

(`bump-minor-pre-major` keeps breaking changes at a minor bump until 1.0.0,
matching how a pre-1.0 version is read.)

To force a specific version once, add a footer to any commit on `main`:
`Release-As: 1.0.0`.

## What lands in the changelog

Only the sections that mean something to a consumer: **Features**, **Bug
Fixes**, **Performance**, **Reverts**. Everything else (CI, docs, chores,
Dependabot bumps) is recorded in git and on the PR, not in `CHANGELOG.md`.

Because the type decides the section, use the type that describes what
shipped: a fix that only touches CI or the demo apps is `ci:` or
`chore(demo):`, not `fix(ci):` (which would list it under Bug Fixes).

## The first release PR

This repository has never released: there is no `v*` tag, no `CHANGELOG.md`,
and `.release-please-manifest.json` records `"." : "0.0.1"` - the version the
root `package.json` has carried since the repo was bootstrapped. Nothing has
been published under `latest` yet, only `next` prereleases from `main`.

So the first release PR appears the first time a `feat:` (or `fix:`) commit
reaches `main` after release-please is in place, and it looks like this:

- **Title:** `chore(release): 0.1.0` - `0.1.0`, not `0.0.2`, because
  `bump-minor-pre-major` turns a `feat` into a minor bump from `0.0.1`. (A
  release cut from `fix:` commits alone would be `0.0.2`.)
- **Branch:** `release-please--branches--main--components--kyc-monorepo`
  (the suffix is the root package name; release-please's branch naming is
  fixed, not configurable)
- **Files:** `CHANGELOG.md` (created, with the `0.1.0` entry),
  `package.json` and `package-lock.json` (root version `0.0.1` → `0.1.0`),
  `.release-please-manifest.json` (`"." : "0.1.0"`)
- **Body:** the changelog entry, which becomes the GitHub Release notes -
  a `## [0.1.0](...) (<date>)` heading followed by the **Features** and
  **Bug Fixes** lists, one line per PR title, each linking its PR and commit.

The v1 work already on `main` is not in that entry: the changelog starts at
the commits since the last release, and the initial history landed before
release-please existed. Give the first release its context by editing
`CHANGELOG.md` on the release branch before merging (below), or by editing
the GitHub Release body afterwards.

### Improving the notes before you merge

The PR is a normal branch. To add a paragraph of context (what the feature
means for an integrator, a migration note), edit `CHANGELOG.md` on the
release branch and push; release-please keeps
hand edits inside the current entry. Or merge as-is and edit the GitHub
Release body afterwards; `CHANGELOG.md` and the release body are separate
copies from that point.

The PR is re-generated on every push to `main`, so a fix merged while the
release PR is open shows up there automatically (and bumps the version if it
changes the bump class).

## What happens on merge, step by step

1. The squash merge `chore(release): X.Y.Z` lands on `main`. `ci.yml` runs
   for it like any push (it publishes a `-pre` build under `next`).
2. `release.yml` runs on the same push, finds the merged release PR,
   creates the `vX.Y.Z` tag and the GitHub Release (body = the changelog
   entry), and dispatches `ci.yml` at that tag with `release_tag=vX.Y.Z`.
   The explicit dispatch exists because GitHub never triggers workflows
   from events the workflow token created; a release made by the bot would
   not fire the `release:` trigger.
3. That release run stamps `X.Y.Z` into the five packages (and pins each
   one's `@blinkbitcoin/kyc-core` dependency to exactly that version),
   builds, runs Checks, Unit and every E2E suite, then the Publish job waits
   for the commit's push-to-`main` run to be green (fails on a red one) and
   publishes under `latest`. Verify installs what was published and asserts
   the consumer contract, including that `/hosted` and `/testing` load
   without Apollo.
4. If the main run was red (a flaky E2E job), re-run its failed job
   (`gh run rerun <id> --failed`); `release.yml`'s retry job re-runs the
   blocked Publish as soon as main is green. Nothing to re-tag.

CI does not run on the release PR itself (same token rule). It only changes
`CHANGELOG.md`, the manifest and the root `package.json` / lockfile; the
tagged run executes the full pipeline before anything ships.

## Checking what would ship, before anything ships

```bash
make version                # the prerelease a push to main publishes today
make version TAG=v0.1.0     # what the tag would publish: 0.1.0 under latest
```

Both are dry runs (`DRY_RUN=1`): they print the decision and write to no
`package.json`. After a release, `make registry-smoke V=X.Y.Z` re-runs the
consumer contract check against GitHub Packages.

## Hand-cut prereleases (rc)

`make release-rc V=X.Y.Z-rc.1` creates a `vX.Y.Z-rc.1` tag and prerelease
by hand. It goes through the `release:` trigger and ships under `next`
(`npm i @blinkbitcoin/kyc-react@next`). release-please ignores such tags;
the next stable release is still computed from the last `vX.Y.Z`.

## When something goes wrong

- **The release run failed after tagging.** GitHub Packages never accepts a
  version twice, so a partially published version cannot be re-shipped: fix
  forward, merge, and the next release PR bumps again. A run that failed
  *before* Publish can simply be re-run.
- **No release PR appears.** Nothing releasable has merged since the last
  tag (only `ci:` / `docs:` / `chore:`), or the `Release` workflow
  run on `main` failed. Check the two setup dependencies below.
- **The version is wrong.** Push a commit with a `Release-As: X.Y.Z` footer,
  or fix the mis-typed commit title's effect by choosing the right type next
  time; the PR follows `main`.

## Setup

Two repository-level settings release-please depends on:

- **The org ruleset must exclude the release branch.** The bot pushes its
  own branch `release-please--**` with the workflow token; a ruleset that
  requires a pull request for every branch refuses that push with
  `Error updating ref heads/release-please--...` in the `Release` run (this
  is exactly what happened on esign's first live release). Exclude
  `release-please--**` from the ruleset's target branches (only an org admin
  can; `main` stays protected, the release PR still merges through it). The
  branch name prefix is hard-coded in release-please, so the branch is
  `release-please--branches--main--components--kyc-monorepo`.
- **GitHub Actions may create pull requests.** Settings → Actions →
  General → "Allow GitHub Actions to create and approve pull requests" (an
  organisation setting can override it). Already enabled for this repository
  (verified 2026-09-06).

GitHub Pages is off by design: the README badges are read from the
`gh-pages` branch directly, so no site build is needed.

## Configuration

- `release-please-config.json`: root component, `release-type: node`
  (maintains the root `package.json` version), `vX.Y.Z` tags, pre-1.0 bump
  policy, PR title pattern (`release` is a commitlint scope), and which
  commit types appear in the changelog.
- `.release-please-manifest.json`: the last released version per component.
- `.github/workflows/release.yml`: the workflow described above (release
  PR / tag job on push, retry job on a completed CI run).
- `scripts/release/resolve-version.mjs`: a release run is
  `EVENT=release TAG=vX.Y.Z`, whether it came from a `release` event or a
  `release_tag` dispatch.
