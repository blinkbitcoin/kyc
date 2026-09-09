# packages/

The four published packages. The two platform packages are what an app
installs (`kyc-core` arrives as a dependency); `kyc-server` is what a
backend installs.

| Package | Entries | Role |
|---------|---------|------|
| [`kyc-react-native/`](kyc-react-native/README.md) | `.`, `./hosted`, `./sumsub` | 📱 **The product on mobile.** `Verification` + `useVerification` over a<br>hardened `react-native-webview`. `./hosted` is Apollo-free - Metro<br>resolves it straight to source. `./sumsub` adds the native-SDK source<br>(`providers/sumsub/`) over the optional Sumsub Mobile SDK peer |
| [`kyc-react/`](kyc-react/README.md) | `.`, `./sumsub` | 🌐 **The product on the web.** The same pair over an origin-pinned<br>iframe, plus the `MountableSource` seam. `./sumsub` is the reserved<br>seat of the web-SDK adapter (none in v1) |
| [`kyc-server/`](kyc-server/README.md) | `.`, `./express`, `./knex`, `./sumsub` | 🖥️ **The server half.** The verification-session domain over the<br>provider + store ports, Sumsub token minting and webhook verification,<br>the hosted page, Fetch handlers, an Express router and a Knex store.<br>Being extracted from `apps/api` (the primitives are in; the domain,<br>adapters and router follow) |
| [`kyc-core/`](kyc-core/README.md) | `.`, `./hosted`, `./testing`, `./sumsub` | 🧩 **The shared vocabulary.** `VerificationSource` + capability guards,<br>the `kyc-bridge` protocol, the state machine both platforms run, the<br>error-code contract, the hosted and proxy sources. `./testing` ships<br>`createFakeLaunchableSource`; `./sumsub` is the one Sumsub mapping<br>(`providers/sumsub/`), also read by the backend |

Two boundaries hold this together and are enforced by tests, not convention:

- **Apollo containment.** Only `createProxySource` imports Apollo. `./hosted`,
  `./testing` and `./sumsub` never reach it - proved by import-graph guard
  tests and by `scripts/pack-smoke.sh`, which installs the packed tarballs and
  asserts that requiring them loads no `@apollo/client` or `graphql`.
- **Provider containment.** Nothing Sumsub-specific lives outside a
  `providers/sumsub/` directory, generic layers never import one, and each
  package's `src/sumsub.ts` is a one-line re-export of its provider surface -
  all guard-tested. The component decides what to render by capability
  (`isLaunchable`, `isMountable`), never by provider name.

All four publish to GitHub Packages at the same version, with `kyc-core`
pinned exactly. Coverage is 100% statements/branches/functions/lines on every
one of them.

`make help` here fans common targets (`test`, `coverage`, `typecheck`,
`build`) out to every package.
