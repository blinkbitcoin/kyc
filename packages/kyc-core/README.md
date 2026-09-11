# @blinkbitcoin/kyc-core

Platform-agnostic core shared by `@blinkbitcoin/kyc-react-native` and
`@blinkbitcoin/kyc-react`: the `VerificationSource` abstraction and its
capability interfaces, the normalized event/status vocabulary, and the
`ErrorCode` wire contract generated from `packages/kyc-service/schema.graphql`, and the
one Sumsub mapping on `/sumsub`. No React, no DOM, no native modules.

## Entry points

| Import | Contents | Needs Apollo? |
|--------|----------|---------------|
| `@blinkbitcoin/kyc-core` | Everything below plus `createProxySource`, `createKycApolloClient`,<br>`getApolloErrorCode`, the GraphQL operations and their generated types | Yes — `@apollo/client` + `graphql` (optional peers) |
| `@blinkbitcoin/kyc-core/hosted` | Contract types + capability guards, the `kyc-bridge` protocol<br>(`interpretBridgeMessage`, `createSetTokenMessage`, `createSetTokenScript`),<br>`createHostedSource`, the verification state machine (`machineReducer`,<br>`planEvent`, `describeOutcome`, `describeFailure`, `isRestartableError`),<br>`getErrorMessage`, the labels contract (`resolveLabelsWith`,<br>`outcomeLabel`, `failureLabel`), `ErrorCodes` / `ClientErrorCodes` | **No — Apollo-free by construction** (guard-tested) |
| `@blinkbitcoin/kyc-core/testing` | `createFakeLaunchableSource` — a UI-free `LaunchableSource` you script<br>(`outcome`) or drive from buttons (`controller`) | **No** (guard-tested) |
| `@blinkbitcoin/kyc-core/sumsub` | Everything on `/hosted` plus the Sumsub mapping (`mapSumsubStatus`,<br>`mapSumsubWebhookStatus`, `mapSumsubMobileResult`,<br>`interpretSumsubWebMessage`, `sumsubSession`, the Sumsub vocabulary) -<br>the surface of `src/providers/sumsub/`, read by the backend too | **No** (guard-tested) |

## The Sumsub mapping (`/sumsub`)

`src/providers/sumsub/mapping.ts` is the single source of truth for Sumsub
semantics: the backend's webhook handler, the hosted page's status table and
the React Native native source (`@blinkbitcoin/kyc-react-native/sumsub`) all
read the same functions, so a rule is written once. Nothing else in the
package names Sumsub, and nothing under `verification/` imports the provider -
both guard-tested.

```ts
import {
  mapSumsubStatus,            // (reviewStatus?, reviewResult?) -> IdentityVerificationStatus
  mapSumsubWebhookType,       // (type, reviewStatus?, reviewResult?) -> IdentityVerificationStatus | null
  mapSumsubWebhookStatus,     // (webhookPayload) -> IdentityVerificationStatus | null
  mapSumsubMobileStatus,      // ('Approved' | ...) -> IdentityVerificationStatus | null
  mapSumsubMobileResult,      // (SNSMobileSDKResult) -> VerificationEvent
  interpretSumsubWebMessage,  // (type, payload) -> VerificationEvent | null
  SUMSUB_EVENT_NAMES,
  SUMSUB_PROVIDER,
  sumsubSession,
} from '@blinkbitcoin/kyc-core/sumsub';
```

| Sumsub review | Normalized status |
|---|---|
| `completed` + `GREEN` | `approved` |
| `completed` + `RED` + `FINAL` | `finallyRejected` |
| `completed` + `RED` + `RETRY` (or no reject type) | `declined` |
| `completed` with no verdict | `pending` |
| `pending`, `queued`, `prechecked`, `onHold` | `pending` |
| `init` | `incomplete` |
| anything else / absent | `initial` |

`interpretSumsubWebMessage` normalizes the five `idCheck.*` messages for a
host that mounts the Sumsub web SDK itself; no web-SDK adapter ships in v1
(the hosted page already covers the browser), and `@blinkbitcoin/kyc-react/sumsub`
is the reserved seat for it.

## The `kyc-bridge` protocol

Two independent contracts move data between the app and the hosted page, and
they are not interchangeable:

- **page -> app** (both platforms): the page posts
  `{ source: 'kyc-bridge', v: 1, type, payload? }` and `interpretBridgeMessage`
  normalizes it into a `VerificationEvent`, or returns `null` for anything
  that is not a well-formed message of this protocol.
- **app -> page, injected script** (React Native, `injectJavaScript`):
  `createSetTokenScript(token)` returns a snippet that calls
  `window.__kycBridge.setToken(token)` with the **bare token string** - there
  is no envelope to check on this path, since the script is trusted (it is
  the app's own code running in the page).
- **app -> page, postMessage** (web, iframe): `createSetTokenMessage(token)`
  returns the **full envelope** (`{ source, v, type: 'setToken', token }`);
  the page must check `source` and `v` before trusting it, the same as any
  other cross-origin message.

Error codes come from two maps: `ErrorCodes` is the GraphQL wire contract
generated from `packages/kyc-service/schema.graphql`; `ClientErrorCodes` (`NETWORK_ERROR`,
`PERMISSION_DENIED`, `SDK_UNAVAILABLE`, `TOKEN_EXPIRED`,
`TOKEN_REFRESH_FAILED`, `BRIDGE_PROTOCOL`) only ever originate on the client
and never appear in the schema. `getErrorMessage(code, serverMessage?)` covers
both.

## The verification state machine

`machineReducer(state, action)` and `planEvent(event, session)` are pure
functions that both platform packages share, so `@blinkbitcoin/kyc-react` and
`@blinkbitcoin/kyc-react-native` cannot drift on what an event means. The
reducer owns the eight states (`idle`, `loading`, `verifying`, `pending`,
`success`, `permissionDenied`, `error`, `offline`); `planEvent` turns a
normalized `VerificationEvent` into the state action it implies plus a
*description* of the host callback it implies, which the platform hook
executes. `describeOutcome(status?)` is the outcome-screen copy,
`describeFailure(error)` states the "the error state always carries an error"
invariant in one tested place, and `isRestartableError(code)` decides whether
the error screen offers Restart or Try again. The `permission` action carries
`reason: 'denied' | 'blocked'` and the reducer keeps it as
`MachineState.permissionReason`, so a platform that can send the user to the
OS settings (React Native) and one that cannot (the browser) still share one
reducer. Nothing here touches React, the DOM, native modules or Apollo.

## Labels and theme

Blink is multilingual and branded, so nothing the default `IdentityVerification`
UI renders is hard-coded in the platform packages. `IdentityVerificationLabels`
names every string (idle title and subtitle, the buttons, the pending,
permission, offline and error screens, one `outcome*` key per decision,
and an `errorMessages` table keyed by error code); `IdentityVerificationTheme`
names the colors and the font. `resolveLabelsWith(defaults, label, labels)`
layers a host's overrides over a platform's defaults (null and undefined
keep the default), `outcomeLabel(labels, status)` picks the outcome copy
and `failureLabel(labels, error)` the error copy, falling back to the
message the error carries. The platform packages own the defaults and the
`theme` / `styles` / `labels` props; this package only guarantees both
resolve copy the same way.

The `IdentityVerification` component and the `useIdentityVerification` hook live in the
platform packages (`@blinkbitcoin/kyc-react-native`,
`@blinkbitcoin/kyc-react`), which both run **this** package's state machine so
they cannot drift. Consumer guides:
[`docs/integration/`](../../docs/integration/consuming.md). Internals:
[`docs/architecture/integration.md`](../../docs/architecture/integration.md).
