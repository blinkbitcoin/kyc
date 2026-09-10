# Mode 1 - Hosted verification page

**Updated:** 2026-09-06

A page that speaks the `kyc-bridge` protocol is embedded in a hardened WebView (React Native) or an origin-pinned iframe (web). This repo's `examples/full-service-demo` serves such a page at `GET /hosted/:sessionId`, but any page of yours that posts the same envelopes works identically - the packages have no knowledge of what renders inside.

## Install

```sh
# React Native - the Apollo-free entry
npm i @blinkbitcoin/kyc-react-native react-native-webview @react-native-community/netinfo

# React web - single entry
npm i @blinkbitcoin/kyc-react
```

## Wiring

```tsx
import { createHostedSource, IdentityVerification } from '@blinkbitcoin/kyc-react-native/hosted';
// web: import { createHostedSource, IdentityVerification } from '@blinkbitcoin/kyc-react';

const source = createHostedSource({
  getSession: async () => yourApi.startVerification(),          // must return { url }
  refreshToken: async (session) => yourApi.refreshToken(session.sessionId),
  // omit refreshToken and an expired token becomes a Restart prompt instead
});
```

| Option | Type | Notes |
|--------|------|-------|
| `url` | `string` | A static page url - the simplest possible source |
| `getSession` | `() => VerificationSession \| Promise<VerificationSession>` | Preferred: mints a url per attempt |
| `allowedOrigin` | `string` | Overrides the derived origin |
| `provider` | `string` | Labels the session, default `'hosted'` |
| `refreshToken` | `(previous: VerificationSession) => Promise<string>` | Supplying it makes the returned source a `TokenRefreshableSource` |

Exactly one of `url` or `getSession` is required; without either, `start()` rejects with `VALIDATION_ERROR`.

**`allowedOrigin` is derived when you do not supply it**, from the session url by regex (scheme + host + port), rather than through the DOM `URL` global - React Native has no built-in `URL` on Hermes without a polyfill, and polyfilled origins differ subtly from the browser's. Anything that is not a well-formed http(s) url yields `undefined`, and the component then **fails closed**: every message from the page is ignored, token refresh is disabled, and a console warning explains why.

## The bridge protocol

[![Hosted Bridge Flow](../diagrams/dist/hosted-bridge-flow.svg)](../diagrams/src/hosted-bridge-flow.mmd)

**Page → app.** One envelope shape:

```ts
{ source: 'kyc-bridge', v: 1, type: <event type>, payload?: Record<string, unknown> }
```

posted through `window.ReactNativeWebView.postMessage(JSON.stringify(msg))` when that global exists, otherwise `window.parent.postMessage(msg, '*')`. `interpretBridgeMessage` accepts an object **or** a JSON string, and returns `null` for anything whose `source` is not `kyc-bridge` or whose `v` is not the supported version - which is precisely what filters the provider SDK's own `postMessage` traffic out of your event stream.

| `type` | Payload | Meaning |
|--------|---------|---------|
| `applicantLoaded` | `{ applicantId: string }` | The provider identified the applicant |
| `submitted` | - | Documents submitted; the flow moves to `pending` |
| `statusChanged` | `{ status: IdentityVerificationStatus }` | Intermediate status |
| `complete` | `{ status: IdentityVerificationStatus, applicantId?: string }` | Terminal outcome |
| `cancel` | - | The user aborted inside the page |
| `tokenExpired` | - | The access token expired and the page wants a new one |
| `sessionExpired` | - | The session is over and cannot be refreshed |
| `error` | `{ code?: string, message?: string }` | Missing `code` becomes `BRIDGE_PROTOCOL` |

**App → page.** Only for token refresh, and the two platforms use different transports on purpose:

- **React Native** injects `createSetTokenScript(token)`, which calls `window.__kycBridge.setToken("<bare token>")`. There is no envelope to validate because an injected script is already trusted; the trailing `true;` is what `injectJavaScript` expects back.
- **Web** posts `createSetTokenMessage(token)` - the full `{ source: 'kyc-bridge', v: 1, type: 'setToken', token }` envelope - at `allowedOrigin`, never at `'*'`. The page must check `source` and `v` before trusting it.

A page that accepts both is trivial: `examples/full-service-demo`'s `readToken` takes either a bare string or an object with a `.token`. This repo's own mock page acknowledges a refreshed token entirely in its own DOM (`document.body.dataset.tokenRefreshed = 'true'`, an element with id `mock-token-refreshed`) rather than by emitting a bridge event - a `statusChanged` there would move your state machine (`pending` hides and mutes the page) and end the flow instead of resuming it, so a page that wants to signal a successful refresh should do the same: acknowledge it locally, not over the bridge.

## Token refresh

When the page emits `tokenExpired`:

- If `isTokenRefreshable(source)` and a session and (on the web) an `allowedOrigin` exist, the hook awaits `refreshToken(session)` and pushes the token back into the page. Two guards keep this honest: an unmount flag drops anything that resolves too late, and a monotonic sequence number means only the newest refresh may inject - latest wins.
- Otherwise, or if the refresh rejects, the flow enters `error` with `TOKEN_EXPIRED` / `TOKEN_REFRESH_FAILED`, **keeping the session**, and the error screen offers **Restart** rather than **Try again**.

`sessionExpired` always takes the Restart path - it is not refreshable by definition. The hosted page you write should emit `sessionExpired` for a session that can no longer progress (unknown, wrong provider, or already terminal) rather than staying silent; `examples/full-service-demo`'s own not-found page (served for those cases, and for a `502` when token minting fails) does exactly this.

## What your host page must allow (web)

The iframe is rendered with `allow="camera; microphone; fullscreen"`, `sandbox="allow-scripts allow-same-origin allow-forms"` and `referrerPolicy="strict-origin-when-cross-origin"`. Three things must line up or the provider's liveness step cannot open the camera:

1. **Your page must be permitted to use the camera itself.** If your app sends a `Permissions-Policy` header, it must not drop `camera` / `microphone` for its own origin - a frame can only be delegated a capability its embedder holds.
2. **Your page must be served over HTTPS** (or `localhost`). Browsers do not grant `getUserMedia` on plain HTTP.
3. **The verification page must allow being framed by you.** This repo's `examples/full-service-demo` serves it with `frame-ancestors *` and no `X-Frame-Options`, and with `Permissions-Policy: camera=(self "https://api.sumsub.com"), microphone=(self "https://api.sumsub.com")`. If your own page sets a CSP, add the verification origin to `frame-src`.

`allow-same-origin` is required, not an oversight: the provider SDK uses its own storage, and a sandbox without it gives the page an opaque origin where every storage access throws. Because the page is served from a *different* origin than your app, that flag restores the page's own origin and grants the frame nothing over your document. `fullscreen` is delegated because a provider's document-capture step can ask for the whole viewport. Popups, top-level navigation and downloads stay denied.

## What the WebView is hardened with (React Native)

`mediaCapturePermissionGrantType: 'grant'` (iOS/macOS only - grants WKWebView capture without a second in-page prompt, the single most common cause of a false "Allow camera access" loop; Android has no equivalent property, and relies on `react-native-webview`'s own `onPermissionRequest` granting whatever the app already holds OS permission for), `allowsInlineMediaPlayback`, `mediaPlaybackRequiresUserAction: false`, `originWhitelist` pinned to `[sessionOrigin, ...allowedNavigationOrigins]` (checked first, for every navigation - react-native-webview opens a miss in the system browser rather than consulting the guard below), a navigation guard re-checking the same list for every navigation action including subframes (and, on Android, allowing an unanswered check through after 250 ms - defense in depth, not a sandbox), `setSupportMultipleWindows: false`, `cacheEnabled: false`, `allowFileAccess: false`, and a pre-content script that installs `window.__kycBridge` so a token arriving before the page's own handler is queued rather than lost. The full table is in [../architecture/mobile.md](../architecture/mobile.md#the-hardened-webview).

## Known limitations

- The hosted URL has no max-age of its own: `GET /hosted/:sessionId` serves the page until the session reaches a terminal status (then it renders the expired page). Session ids are unguessable, and the provider access token inside the page still expires on the provider's schedule.
- The `IdentityVerification` components' built-in strings (buttons, status copy, permission screens) are English only and not overridable yet; use `useIdentityVerification` and render your own UI if you need localized copy.

## Writing your own hosted page

Everything the packages require of a page:

1. Post `kyc-bridge` envelopes for the events above, preferring `window.ReactNativeWebView.postMessage` when it exists.
2. Accept a `setToken` in either transport and hand the token to the provider SDK.
3. Serve it over HTTPS, allow being framed, and delegate `camera` / `microphone` to the provider's origin.

`packages/kyc-server/src/providers/sumsub/page.ts` (and the mock's `providers/mock/page.ts`) is a complete worked example, including the CSP.
