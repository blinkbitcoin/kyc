# @blinkbitcoin/kyc-core

Platform-agnostic core shared by `@blinkbitcoin/kyc-react-native` and
`@blinkbitcoin/kyc-react`: the `VerificationSource` abstraction and its
capability interfaces, the normalized event/status vocabulary, and the
`ErrorCode` wire contract generated from `apps/api/schema.graphql`. No React,
no DOM, no native modules.

| Import | Contents | Needs Apollo? |
|--------|----------|---------------|
| `@blinkbitcoin/kyc-core` | Everything | Yes, once the proxy source lands (optional peers) |
| `@blinkbitcoin/kyc-core/hosted` | Contract types, guards, error codes | **No — Apollo-free by construction** (guard-tested) |

Status: bootstrap. The sources (`createProxySource`, hosted bridge protocol)
follow in the core phase — see `docs/superpowers/specs/2026-09-05-kyc-design.md`.
