# @blinkbitcoin/kyc-core

Platform-agnostic core shared by `@blinkbitcoin/kyc-react-native` and
`@blinkbitcoin/kyc-react`: the `VerificationSource` abstraction and its
capability interfaces, the normalized event/status vocabulary, and the
`ErrorCode` wire contract generated from `apps/api/schema.graphql`. No React,
no DOM, no native modules.

| Import | Contents | Needs Apollo? |
|--------|----------|---------------|
| `@blinkbitcoin/kyc-core` | Everything below plus `createProxySource`, `createKycApolloClient`, `getApolloErrorCode`, the GraphQL operations and their generated types | Yes — `@apollo/client` + `graphql` (optional peers) |
| `@blinkbitcoin/kyc-core/hosted` | Contract types + capability guards, the `kyc-bridge` protocol (`interpretBridgeMessage`, `createSetTokenMessage`, `createSetTokenScript`), `createHostedSource`, the verification state machine (`machineReducer`, `planEvent`, `describeOutcome`, `describeFailure`, `isRestartableError`), `getErrorMessage`, `ErrorCodes` / `ClientErrorCodes` | **No — Apollo-free by construction** (guard-tested) |
| `@blinkbitcoin/kyc-core/testing` | `createFakeLaunchableSource` — a UI-free `LaunchableSource` you script (`outcome`) or drive from buttons (`controller`) | **No** (guard-tested) |

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
generated from `apps/api/schema.graphql`; `ClientErrorCodes` (`NETWORK_ERROR`,
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

The `Verification` component and the `useVerification` hook live in the
platform packages (`@blinkbitcoin/kyc-react-native`,
`@blinkbitcoin/kyc-react`), which both run **this** package's state machine so
they cannot drift. Consumer guides:
[`docs/integration/`](../../docs/integration/consuming.md). Internals:
[`docs/architecture/integration.md`](../../docs/architecture/integration.md).
