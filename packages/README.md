# packages/

The four published packages. Only the two platform packages are installed
directly - `kyc-core` arrives as a dependency, and `kyc-sumsub` only when you
use the native SDK mode.

| Package | Entries | Role |
|---------|---------|------|
| [`kyc-react-native/`](kyc-react-native/README.md) | `.`, `./hosted` | 📱 **The product on mobile.** `Verification` + `useVerification` over a hardened `react-native-webview`. `./hosted` is Apollo-free - Metro resolves it straight to source |
| [`kyc-react/`](kyc-react/README.md) | `.` | 🌐 **The product on the web.** The same pair over an origin-pinned iframe, plus the `MountableSource` seam. One entry, side-effect-free |
| [`kyc-core/`](kyc-core/README.md) | `.`, `./hosted`, `./testing` | 🧩 **The shared vocabulary.** `VerificationSource` + capability guards, the `kyc-bridge` protocol, the state machine both platforms run, the error-code contract, the hosted and proxy sources. `./testing` ships `createFakeLaunchableSource` |
| [`kyc-sumsub/`](kyc-sumsub/README.md) | `.`, `./react-native`, `./web` | 🪪 **The only Sumsub-aware code.** Shared status/event mapping (pure TS), the native-SDK source, and a reserved web entry with no adapter in v1 |

Two boundaries hold this together and are enforced by tests, not convention:

- **Apollo containment.** Only `createProxySource` imports Apollo. `./hosted`
  never reaches it - proved by an import-graph guard test and by
  `scripts/pack-smoke.sh`, which installs the packed tarballs and asserts that
  requiring `/hosted` loads no `@apollo/client` or `graphql`.
- **Provider containment.** Nothing outside `kyc-sumsub` names a provider. The
  component decides what to render by capability (`isLaunchable`,
  `isMountable`), never by provider name.

All four publish to GitHub Packages at the same version, with `kyc-core`
pinned exactly. Coverage is 100% statements/branches/functions/lines on every
one of them.

`make help` here fans common targets (`test`, `coverage`, `typecheck`,
`build`) out to every package.
