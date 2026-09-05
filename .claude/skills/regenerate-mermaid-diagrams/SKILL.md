---
name: regenerate-mermaid-diagrams
description: Use when editing or adding any diagram under docs/diagrams/ (sources are src/*.mmd; the combined page (docs/diagrams/README.md) is generated - always run `make diagrams` after changing a source), or when architecture, data-model, or verification-flow changes make the diagrams stale.
---

# Regenerate Mermaid Diagrams

Update the diagrams under `docs/diagrams/`. Mermaid is the single diagram
*source* format on purpose: it diffs as text and is hand-maintainable
alongside the docs. The combined page embeds pre-rendered SVGs so it loads
instantly on GitHub (a live mermaid block boots its own render iframe, which
is slow).

**Edit the per-diagram sources in `docs/diagrams/src/*.mmd`** - they are
canonical. `docs/diagrams/dist/*.svg` and `docs/diagrams/README.md`
are GENERATED from them by `make diagrams` (pinned mermaid-cli renders the
SVGs; scripts/assemble-diagrams.mjs assembles the page and owns section
titles and prose). A pre-commit hook re-runs this and stages the outputs;
CI fails if the page drifts or an SVG is missing/stale. Adding a diagram =
new .mmd file + an entry in assemble-diagrams.mjs's SECTIONS + a row in the
table below. Keep labels free of bare `;` (mermaid parses it as a statement
separator - mermaid-cli rejects it even where GitHub's renderer is lenient).

## Ground rules

- **Docs are the source of truth for shape, code for names.** Derive each
  diagram from the doc listed below, then verify every identifier (package
  names, routes, columns, event names) against the code - docs can lag.
- **Never invent components.** If a doc and the code disagree, fix the doc
  first (or flag it), then diagram the corrected state.
- The current package names are `@blinkbitcoin/kyc-core`,
  `@blinkbitcoin/kyc-sumsub`, `@blinkbitcoin/kyc-react-native`,
  `@blinkbitcoin/kyc-react` under `packages/`; the backend is `apps/api`. If
  these have changed, trust `packages/*/package.json` over any doc.

## The diagram(s): provenance and embeds

The SVG is also embeddable in the docs the diagram belongs to (same
`[![...](.svg)](.mmd)` pattern as the combined page) - renaming or removing
a diagram must update its "Embedded in" doc too:

| # | Diagram | Type | Source of truth | Embedded in |
|---|---------|------|-----------------|-------------|
| 1 | System Architecture | `flowchart TB` | `README.md` (modes) + the design spec | combined page only |

## Pedagogy and consistency rules

These keep the set readable as a progression, not a pile of unrelated pictures:

- **Mode-aware labeling.** The repo has three integration modes (native /
  web SDK, hosted page, proxy). Any diagram that is mode-specific says so in
  its heading; the System Architecture diagram shows where the three modes
  diverge and notes that only the proxy source touches Apollo.
- **Same names everywhere.** A node representing `Verification`,
  `VerificationSource`, a route, or a DB column uses the exact identifier
  from code - never a paraphrase ("Verification component") that readers
  must map.
- **Consistent colors** (hex, applied via `style`):
  - `#b2f2bb` green - success / terminal-good states
  - `#ffc9c9` red - error / terminal-bad states
  - `#ffec99` yellow - recoverable states (offline, session expiry, cancel)
- **Event vocabulary is real.** Use the real normalized names from
  `packages/kyc-core/src/verification/types.ts` (`applicantLoaded`,
  `submitted`, `statusChanged`, `complete`, `cancel`, `tokenExpired`,
  `sessionExpired`, `error`).
- Separate diagrams with `---`; keep the one-line intro under each `##`
  heading if it adds a constraint the picture can't show.

## Verification before finishing

1. Run `make diagrams`; it renders every SVG without a parse error, the
   generated page's image count matches the table above (currently 1), and
   `git status` shows regenerated SVGs only for diagrams you touched.
2. `grep` the sources for stale identifiers: old package names, any route
   not present in `apps/api/src/app.ts`.
3. ERD (once one exists) matches the latest migration exactly.
4. `docs/index.md` still links the file with an accurate description.
5. Run `npm run format` and `make check-code`.
