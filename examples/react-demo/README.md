# kyc-react-example

Vite + React 19 host for `@blinkbitcoin/kyc-react`: manual testing and the
Playwright E2E target. `VITE_KYC_MODE` selects the mode at build time.

| `VITE_KYC_MODE` | Source | Needs |
|---|---|---|
| `hosted` (default) | `createHostedSource` whose `getSession`/`refreshToken` delegate to<br>the backend proxy | backend + database |
| `proxy` | `createProxySource({ client, platform: 'WEB' })` | backend + database |

```bash
make web                          # repo root, hosted mode on :5101 (KYC_WEB_PORT)
VITE_KYC_MODE=proxy npm run dev   # here, proxy mode
VITE_KYC_UI=themed npm run dev    # the same flow under Blink's palette and Spanish copy
```

`VITE_KYC_UI` picks the look: `default` is the component's own copy and
colors, `themed` hands it the `theme` and `labels` props from
`src/theme.ts` - what a branded, multilingual host writes. The testids are
the same in both, so every Playwright spec runs under either.

The screen mirrors the React Native demo: `mode-label`, `reset-button`,
`outcome`, around the library's `<IdentityVerification />`. The verification page is
embedded in a genuinely cross-origin iframe (built app via `vite preview`
on the worktree's Vite port, page on its backend port), so the E2E suites
exercise the real `postMessage` path and the origin pin.

## What to look at

- `src/source.ts` - `buildSource(VITE_KYC_MODE)`: one `VerificationSource`
  per mode, the whole integration a host writes.
- `src/config.ts` - the mode and the look, resolved from Vite's env at build
  time; the backend origin from `VITE_API_ORIGIN` (the E2E stack sets it).
- `src/apollo.ts` - the client factory from the package, the host's endpoint
  and token.
- `src/theme.ts` - what a branded, multilingual host hands the component.
- `src/App.tsx` - the screen contract the Playwright specs drive.

## Permissions

Camera/microphone access is delegated to the iframe through its `allow`
attribute (`HostedFrame` sets this) - there is no separate JS permission API
on the web the way there is on native. A real host embedding the page must
not strip that `allow` attribute (e.g. by re-wrapping the iframe or copying
its markup without it), or the browser silently denies the verification
page's own camera/mic prompt with no error the host can see.

## E2E

```bash
make e2e-web                     # hosted - what CI runs
make e2e-web-proxy               # proxy
KYC_PORT_BASE=5300 make e2e-web   # another worktree: the whole stack moves with the base
```

Every service listens on `KYC_PORT_BASE` (5100) plus its offset: the
backend +0, this demo +1 (hosted) / +2 (proxy); `e2e/ports.ts` mirrors the
table in `scripts/lib/ports.mjs` (its test pins it), so parallel repos and
worktrees never adopt each other's servers, and a service's own variable
(`KYC_API_PORT`, `KYC_WEB_PORT`, `KYC_WEB_PROXY_PORT`) overrides just that
one. The backend is started with its port, `PUBLIC_BASE_URL` on it and the
two demo origins in `CORS_ALLOWED_ORIGINS`. The dev server (`make web`)
listens on the same hosted port and finds a backend elsewhere through
`VITE_API_ORIGIN`.

Both targets build the libraries, bring up the dockerized test Postgres,
migrate it, and let Playwright start the backend and build + preview the
demo - so the browser drives the production bundle over the libraries' `dist`,
which is what a consumer installs. Both demo ports are already in
`packages/kyc-service/.env.test`'s `CORS_ALLOWED_ORIGINS`.
