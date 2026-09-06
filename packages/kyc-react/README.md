# @blinkbitcoin/kyc-react

Plug-and-play identity verification (KYC) for React web apps. One component,
one hook, an origin-pinned iframe — the app never learns a provider name.

```sh
npm install @blinkbitcoin/kyc-react
```

| Peer | Version | Needed for |
|------|---------|-----------|
| `react` | ≥18 | always |
| `@apollo/client` + `graphql` | ^4 / ^16‖^17 | **proxy mode only** (optional) |

There is a single entry point. The React Native package has an Apollo-free
`/hosted` subpath because Metro resolves the `react-native` export condition
straight to source; on the web a bundler simply tree-shakes what you never
import (`"sideEffects": false`), so hosted-only apps never need the GraphQL
peers installed.

## Modes

### 1. Hosted page

A page that speaks the `kyc-bridge` protocol (this repo's `apps/api` serves
one) is embedded in an origin-pinned iframe.

```tsx
import { createHostedSource, Verification } from '@blinkbitcoin/kyc-react';

const source = createHostedSource({
  getSession: async () => yourApi.startVerification(), // must return { url }
  refreshToken: async (session) => yourApi.refreshToken(session.sessionId),
  // omit refreshToken and an expired token becomes a Restart prompt
});

<Verification
  source={source}
  onComplete={(result) => console.log(result.status)}
  onError={(error) => console.warn(error.code, error.message)}
  onCancel={() => history.back()}
/>;
```

### 2. Proxy session

Full orchestration against this repo's backend (needs the Apollo peers).

```tsx
import {
  createKycApolloClient,
  createProxySource,
  Verification,
} from '@blinkbitcoin/kyc-react';

const client = createKycApolloClient({ uri: API_URL, getAuthToken });
const source = createProxySource({ client, platform: 'WEB' });
```

### 3. Provider web SDK (seam only in v1)

A source that renders itself implements `MountableSource`; the component then
hands it a `<div data-testid="verification-mount">` instead of embedding a
URL:

```ts
import type { MountableSource } from '@blinkbitcoin/kyc-react';

const source: MountableSource = {
  start: async () => ({ provider: 'acme', accessToken: await mintToken() }),
  interpret: () => null,          // the SDK reports through onEvent, not postMessage
  mount: (container, session, onEvent) => {
    const instance = acmeSdk.launch(container, session.accessToken, onEvent);
    return () => instance.destroy();
  },
};
```

`mount` is synchronous and returns its cleanup: anything that must be fetched
first (an SDK bundle, a token) belongs in `start()`, where a rejection already
becomes a proper error state. **No adapter ships in v1** — Sumsub's web SDK is
itself an iframe, so the hosted mode already covers the browser.

## What the host page must allow

The iframe is rendered with `allow="camera; microphone"`,
`sandbox="allow-scripts allow-same-origin allow-forms"` and
`referrerPolicy="strict-origin-when-cross-origin"`. Three things have to line
up or the provider's liveness step cannot open the camera:

1. **Your page must be permitted to use the camera itself.** If your app sends
   a `Permissions-Policy` header, it must not drop `camera` / `microphone`
   for its own origin — the iframe can only be delegated a capability the
   embedder holds.
2. **Your page must be served over HTTPS** (or `localhost`). Browsers do not
   grant `getUserMedia` on plain HTTP.
3. **The verification page must allow being framed by you.** This repo's
   `apps/api` serves it with `frame-ancestors *` and no `X-Frame-Options`, and
   with `Permissions-Policy: camera=(self "https://api.sumsub.com"),
   microphone=(self "https://api.sumsub.com")`. If your own page sets a CSP,
   add the verification origin to `frame-src`.

`allow-same-origin` in the sandbox is required, not an oversight: the provider
SDK the page loads uses its own storage, and a sandbox without it gives the
page an opaque origin where every storage access throws. Because the page is
served from a *different* origin than your app, "same origin" there means the
page's own origin — it grants the frame nothing over your document. Popups,
top-level navigation and downloads stay denied.

## Origin pinning

The hosted page posts its events to `window.parent` with a target origin of
`'*'` and does not check who is embedding it, so **the pin lives entirely on
this side**. `HostedFrame` accepts a message only when both are true:

- `event.origin === session.allowedOrigin`, and
- `event.source` is the exact `contentWindow` of the frame it rendered.

`createHostedSource` derives `allowedOrigin` from the session URL when the
session does not carry one. If it ends up `undefined` (a URL that is not
http(s)), the component fails closed: **every** message from the page is
ignored, token refresh is disabled, and a console warning explains why. Token
refreshes are posted with `postMessage(createSetTokenMessage(token),
allowedOrigin)` — never with `'*'`.

## `<Verification />` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `VerificationSource` | — | The mode. See the factories above. |
| `onComplete` | `(result: VerificationResult) => void` | — | Terminal outcome, including `pending`, `declined` and `finallyRejected`. |
| `onError` | `(error: { code, message }) => void` | — | Failures only (never offline / permission-denied). |
| `onCancel` | `() => void` | — | User aborted. |
| `onStatusChange` | `(status: VerificationStatus) => void` | — | Every intermediate status. |
| `label` | `string` | `'Verify identity'` | Idle-screen title and button. |
| `successDelayMs` | `number` | `1500` | Success screen before `onComplete` (approvals only). |
| `frameTitle` | `string` | `'Identity verification'` | Accessible name for the embedded page. |
| `style` | `CSSProperties` | — | Applied once, to the component's single root element. |

Screens carry stable `data-testid` attributes so E2E flows can drive them —
the same names `@blinkbitcoin/kyc-react-native` uses as `testID`:
`verification-start-button`, `verification-cancel-button` (idle, while the
page is showing, and on the error screen), `loading-indicator`,
`verification-iframe` (where React Native has `verification-webview`),
`verification-mount`, `launch-screen`, `pending-screen`, `pending-message`,
`success-screen`, `permission-screen`, `retry-button`, `offline-screen`,
`check-connection-button`, `error-screen`, `error-message`,
`restart-button`. React Native's `open-settings-button` has no web
counterpart: the browser has no OS-settings intent to fire, so the permission
screen's only action is **Try again**.

The `<iframe>` (or the `MountPoint` container) is mounted **once** and stays
mounted from `verifying` through `pending` — hidden (`hidden` + `inert` +
`aria-hidden`, zero size, `visibility: hidden`) rather than unmounted, so the
page's bridge survives the review wait and a late `complete`, token refresh
or retry still arrives. While the page is showing, the component adds exactly
one affordance of its own: the `verification-cancel-button` under it.

## `useVerification(source, options)`

The component is a thin UI over this hook; use it directly for a custom look.

```tsx
const {
  status,      // 'idle' | 'loading' | 'verifying' | 'pending' | 'success'
               // | 'permissionDenied' | 'error' | 'offline'
  session,     // the running VerificationSession, or null
  result,      // the terminal VerificationResult, or null
  error,       // { code, message } | null
  permissionReason, // 'denied' | 'blocked' | null - always 'denied' on the web
  isOnline,    // live navigator.onLine
  start, retry, restart, cancel,
  handleMessage,   // feed a raw page payload in
  handleEvent,     // feed an already-normalized VerificationEvent in
  iframeRef,       // attach to <HostedFrame> so refreshes can be posted
} = useVerification(source, { onComplete, onError, onCancel });
```

- `success` means **approved**. Every other terminal status renders as the
  outcome screen (`status === 'pending'`) with `result.status` carrying the
  detail — `describeOutcome(result.status)` is the copy the component uses.
- `offline` and `permissionDenied` do **not** call `onError`: both are
  expected, recoverable states with their own screen and a retry affordance.
  There is no permission preflight — browsers prompt for the camera
  themselves, so `permissionDenied` is entered when the page reports an
  `error` with code `PERMISSION_DENIED`, always with
  `permissionReason === 'denied'` (the `'blocked'` arm of the shared type is
  React Native's, where an app can open the OS settings).
- Connectivity is `navigator.onLine` plus the `online` / `offline` window
  events: going offline while the page is up parks on the offline screen;
  coming back online never resumes by itself, the user presses **Check
  connection**.
- `start()` is ignored while a run is already in flight, so a double click
  cannot mint two sessions. `retry()` re-runs the whole flow; `restart()`
  additionally drops the stored session, which is what a `TOKEN_EXPIRED` /
  `TOKEN_REFRESH_FAILED` error screen offers. All three retire a pending
  delayed `onComplete` first, so a previous run's success can never fire over
  a newer one; `cancel()` does the same and then calls `onCancel` only.
- The state machine (`machineReducer`, `planEvent`, `describeOutcome`,
  `describeFailure`, `isRestartableError`) lives in `@blinkbitcoin/kyc-core`
  and is shared with `@blinkbitcoin/kyc-react-native`, so both platforms
  behave identically.
