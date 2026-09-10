# Architecture - Web (`@blinkbitcoin/kyc-react`)

**Part:** react
**Type:** Publishable React web library (tsup)
**Updated:** 2026-09-10

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Language | TypeScript | 6.0.x |
| UI | React | 19.2.x (peer ≥18) |
| Embedding | `<iframe>` (no dependency) | - |
| Build | tsup | 8.x |
| Testing | Jest 30 with the `jsdom` environment + `@testing-library/react` 16 | 100% thresholds |

## Package structure

| Path | Role |
|------|------|
| `src/Verification.tsx` | One screen per state |
| `src/useVerification.ts` | The headless flow |
| `src/useTokenRefresh.ts` | `postMessage` token push behind mount and sequence guards |
| `src/hosted/frameProps.ts` | The hardened iframe attributes and the message guard, **as data** |
| `src/hosted/HostedFrame.tsx` | The component that applies them and owns the `message` listener |
| `src/mountable.ts`, `src/MountPoint.tsx` | The `MountableSource` seam and the `<div>` a mountable source is handed |
| `src/types.ts`, `src/index.ts` | Type barrel and the single entry |
| `src/theme.ts` | The base inline styles, `DEFAULT_LABELS`, `resolveStyles` / `resolveLabels` (base < `theme` < `styles`; default < `label` < `labels`) |
| `src/hosted.ts` | The Apollo-free `./hosted` entry - the same import a React Native host writes; the component modules import core's hosted entry, so it is Apollo-free by construction (guard-tested, pack-smoked) |

**There is no `./hosted` subpath on the web, deliberately.** There is no Metro-style export condition to satisfy and no native peer to keep out of a build, so the single `.` entry re-exports the whole core and bundlers drop what a hosted-only app never imports (`"sideEffects": false`).

## The same machine, two web-specific rules

The eight states, the outcome copy and the Restart rule come from `@blinkbitcoin/kyc-core`. Two things differ from React Native:

1. **No permission preflight.** There is no `checkPermissions` / `onOpenSettings`; browsers prompt for the camera themselves. `permissionDenied` is entered *reactively*, when a bridge `error` event carries `PERMISSION_DENIED` - intercepted in `handleEvent` before the shared planner, and `onError` is **not** called for it. The reason recorded is always `'denied'`: a browser has no way to report a permanently blocked permission, so the screen always offers **Try again**. That interception is the single web-only deviation from `planEvent`.
2. **Connectivity is `navigator.onLine`** plus the `online` / `offline` window events, so an app that drops its connection while the page is on screen (`loading`, `verifying` or `pending`) falls back to the offline screen instead of hanging. Coming back online never resumes by itself - the user presses **Try again**.

## `<Verification />` props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `VerificationSource` | - | The mode |
| `onComplete` | `(result: VerificationResult) => void` | - | Terminal outcome |
| `onError` | `(error: VerificationError) => void` | - | Failures only |
| `onCancel` | `() => void` | - | The user aborted |
| `onStatusChange` | `(status: VerificationStatus) => void` | - | Every intermediate status |
| `label` | `string` | `'Verify identity'` | Idle title and button |
| `theme` | `VerificationTheme` | - | Colors and font for the built-in screens (`src/theme.ts` resolves base < theme < `styles`) |
| `styles` | `VerificationStyles` | - | Per-element inline-style overrides by `VerificationStyleKey` |
| `labels` | `VerificationLabels` | - | Every string the screens render, resolved by core's `resolveLabelsWith` over `DEFAULT_LABELS` |
| `successDelayMs` | `number` | `1500` | Success screen before `onComplete` |
| `frameTitle` | `string` | `'Identity verification'` | Accessible name for the embedded page |
| `style` | `CSSProperties` | - | Applied to every screen and to the frame / mount container |

`data-testid` contract: `verification-start-button`, `verification-cancel-button` (idle screen, and the cancel affordance shown while a hosted session is `verifying`), `loading-indicator`, `verification-iframe`, `verification-mount`, `launch-screen`, `pending-screen`, `pending-message`, `success-screen`, `permission-screen`, `offline-screen`, `check-connection-button`, `error-screen`, `error-message`, `retry-button`, `restart-button`. These are the same testIDs the React Native package uses, minus `open-settings-button` - there is no preflight, so there is no settings affordance to render.

## The origin-pinned iframe

`createHostedFrameProps` returns the attribute set as data:

| Attribute | Value |
|-----------|-------|
| `allow` | `camera; microphone; fullscreen` (`FRAME_ALLOW`) |
| `sandbox` | `allow-scripts allow-same-origin allow-forms` (`FRAME_SANDBOX`) |
| `referrerPolicy` | `strict-origin-when-cross-origin` |
| `loading` | `eager` |

`fullscreen` is delegated because a provider SDK's document-capture step can ask for the whole viewport; a frame not delegated it simply fails that request. `allow-same-origin` is required, not an oversight: the provider SDK the page loads uses its own storage, and a sandbox without it gives the page an opaque origin where every storage access throws. Because the page is served from a *different* origin than the host app, that flag restores the **page's** origin and grants the frame nothing over the embedder's document. Popups, top-level navigation, downloads and pointer lock stay denied.

`createMessageGuard` accepts a message only when **both** hold: `event.origin === allowedOrigin`, and `event.source` is the exact `contentWindow` of the frame that was rendered. The origin alone is insufficient - any other frame on the page could be navigated to the same origin. With no `allowedOrigin` the guard rejects everything, `HostedFrame` warns once (not once per message), and token refresh refuses with `TOKEN_EXPIRED` rather than falling back to `postMessage(..., '*')`.

## The mountable seam

```ts
export interface MountableSource extends VerificationSource {
  mount(
    container: HTMLElement,
    session: VerificationSession,
    onEvent: (event: VerificationEvent) => void,
  ): () => void;
}
export const isMountable: (source: VerificationSource) => source is MountableSource;
```

`mount` is **synchronous** and returns its cleanup: anything that must be fetched first (an SDK bundle, a token) belongs in `start()`, where a rejection already becomes a proper error state. A throwing `mount` surfaces as an `error` event with the thrown code, or `SDK_UNAVAILABLE`. `HTMLElement` never enters `@blinkbitcoin/kyc-core`, which is exactly why this type lives here.

**No adapter ships in v1.** Sumsub's web SDK is itself an iframe, so the hosted mode already covers the browser; the seam exists so a future provider that renders in-process needs no change to the component.

## Testing strategy

Jest + jsdom + `@testing-library/react`, 100% thresholds, `collectCoverageFrom: ['src/**/*.{ts,tsx}']` so a new file cannot hide from the gate. Playwright drives the real cross-origin iframe in `make e2e-web` (hosted) and `make e2e-web-proxy` (proxy) on per-worktree ports (`e2e/ports.ts`; block 0 is 5173 / 5174 with the backend on 4000).
