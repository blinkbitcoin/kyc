# @blinkbitcoin/kyc-core

Platform-agnostic core shared by `@blinkbitcoin/kyc-react-native` and
`@blinkbitcoin/kyc-react`: the `VerificationSource` abstraction and its
capability interfaces, the normalized event/status vocabulary, and the
`ErrorCode` wire contract generated from `apps/api/schema.graphql`. No React,
no DOM, no native modules.

| Import | Contents | Needs Apollo? |
|--------|----------|---------------|
| `@blinkbitcoin/kyc-core` | Everything below plus `createProxySource`, `createKycApolloClient`, `getApolloErrorCode`, the GraphQL operations and their generated types | Yes — `@apollo/client` + `graphql` (optional peers) |
| `@blinkbitcoin/kyc-core/hosted` | Contract types + capability guards, the `kyc-bridge` protocol (`interpretBridgeMessage`, `createSetTokenMessage`, `createSetTokenScript`), `createHostedSource`, `getErrorMessage`, `ErrorCodes` / `ClientErrorCodes` | **No — Apollo-free by construction** (guard-tested) |
| `@blinkbitcoin/kyc-core/testing` | `createFakeLaunchableSource` — a UI-free `LaunchableSource` you script (`outcome`) or drive from buttons (`controller`) | **No** (guard-tested) |

Error codes come from two maps: `ErrorCodes` is the GraphQL wire contract
generated from `apps/api/schema.graphql`; `ClientErrorCodes` (`NETWORK_ERROR`,
`PERMISSION_DENIED`, `SDK_UNAVAILABLE`, `TOKEN_EXPIRED`,
`TOKEN_REFRESH_FAILED`, `BRIDGE_PROTOCOL`) only ever originate on the client
and never appear in the schema. `getErrorMessage(code, serverMessage?)` covers
both.

Status: the `Verification` component and `useVerification` hook live in the
platform packages and land with their phases — see
`docs/superpowers/specs/2026-09-05-kyc-design.md`.
