# API Contracts - Backend

**Part:** backend
**Updated:** 2026-09-10

## Overview

`examples/full-service-demo` exposes one GraphQL endpoint and three HTTP routes; the SDL and the routes come from `@blinkbitcoin/kyc-server` (`typeDefs` in `packages/kyc-server/src/graphql.ts`, the router in `src/express.ts`), the service only mounts them. The SDL is re-exported by the service's `src/typeDefs.ts` and emitted to `examples/full-service-demo/schema.graphql` by `npm run schema:emit -w examples/full-service-demo`; `make codegen` then regenerates `packages/kyc-core/src/generated/`. `make codegen-check` fails if either artifact drifts.

## GraphQL API

### Endpoint

`POST /graphql` - rate-limited 100/min, CORS restricted to `CORS_ALLOWED_ORIGINS` (no origins configured means no cross-origin access at all), body limit 64 kb, introspection disabled in production.

### Schema

```graphql
type Query {
  health: HealthCheck!
  verificationSession(id: ID!): VerificationSessionStatus!
}

type Mutation {
  verificationSessionStart(input: VerificationSessionStartInput!): VerificationSession!
  verificationSessionRefresh(sessionId: ID!): AccessToken!
}

type HealthCheck {
  status: String!
  timestamp: String!
}

enum VerificationPlatform { WEB IOS ANDROID }

enum VerificationStatus {
  initial
  incomplete
  pending
  approved
  declined
  finallyRejected
}

input VerificationSessionStartInput {
  platform: VerificationPlatform!
  levelName: String
  locale: String
}

type VerificationSession {
  sessionId: ID!
  provider: String!
  status: VerificationStatus!
  accessToken: String
  url: String
  allowedOrigin: String
  applicantId: String
}

type VerificationSessionStatus {
  sessionId: ID!
  provider: String!
  status: VerificationStatus!
  applicantId: String
}

type AccessToken {
  accessToken: String!
}

enum ErrorCode {
  UNAUTHORIZED
  VALIDATION_ERROR
  PROVIDER_UNAVAILABLE
  SESSION_NOT_FOUND
  SESSION_CREATION_FAILED
  PERSISTENCE_FAILED
}
```

**The provider's own session id is intentionally not exposed.** `applicantId` is the provider's applicant identifier, which the client needs for support flows; the internal provider session id never leaves the service.

## Mutations

### `verificationSessionStart`

Creates a verification session for the authenticated user and returns everything all three modes might need: a token (mode 1), a hosted url plus its origin (mode 2), and the session id the proxy uses for refresh and status (mode 3).

```graphql
mutation VerificationSessionStart($input: VerificationSessionStartInput!) {
  verificationSessionStart(input: $input) {
    sessionId
    provider
    status
    accessToken
    url
    allowedOrigin
    applicantId
  }
}
```

| Argument | Type | Validation |
|----------|------|-----------|
| `input.platform` | `VerificationPlatform!` | Must be `WEB`, `IOS` or `ANDROID` |
| `input.levelName` | `String` | Non-empty when provided, at most 100 characters |
| `input.locale` | `String` | Non-empty when provided, at most 35 characters, and must match `^[a-z]{2}(-[A-Z]{2})?$` (e.g. `"en"`, `"en-US"`) - narrower than RFC 5646 because it is handed straight to the provider SDK's own locale config |

`url` is always `<PUBLIC_BASE_URL>/hosted/<sessionId>` and `allowedOrigin` is that base's origin, so a hosted-mode client never has to construct either. `locale` is persisted on the session row and threaded to the hosted page (see [backend.md](backend.md#the-hosted-page)).

Errors: `UNAUTHORIZED`, `VALIDATION_ERROR`, `PERSISTENCE_FAILED`, `SESSION_CREATION_FAILED`, `PROVIDER_UNAVAILABLE`.

### `verificationSessionRefresh`

```graphql
mutation VerificationSessionRefresh($sessionId: ID!) {
  verificationSessionRefresh(sessionId: $sessionId) {
    accessToken
  }
}
```

Mints a fresh provider access token for a session the caller owns, and records a `token_refreshed` audit entry. Rejects a terminal session with `VALIDATION_ERROR` rather than minting a live SDK token for a decision that can no longer change. Errors: `UNAUTHORIZED`, `VALIDATION_ERROR`, `SESSION_NOT_FOUND`, `PROVIDER_UNAVAILABLE`.

## Queries

### `verificationSession`

```graphql
query GetVerificationSession($id: ID!) {
  verificationSession(id: $id) {
    sessionId
    provider
    status
    applicantId
  }
}
```

Returns the stored status. When the status is not terminal, the resolver makes one best-effort reconciliation call to the provider - by applicant id once one is bound, otherwise by user id when the provider implements `getStatusByUserId` - and persists any change through the same conditional write the webhook path uses (`status_updated` audit entry, `source: 'api'`). This is a convenience, not the truth: **webhooks are the backend's source of truth**, and the client hook does not poll.

Errors: `UNAUTHORIZED`, `VALIDATION_ERROR`, `SESSION_NOT_FOUND`.

### `health`

```graphql
query { health { status timestamp } }
```

## Error codes

Every resolver failure carries `extensions.code` from the `ErrorCode` enum above. The consumer-facing table - what each one means and what a host should do about it - is [../integration/error-codes.md](../integration/error-codes.md).

## REST endpoints

### `GET /health`

`200 {"status":"ok","timestamp":"<ISO>"}`. Used by the E2E harness and by Playwright's `webServer` readiness probe.

### `GET /hosted/:sessionId`

Serves the verification page for a session, with a fresh access token, a per-request CSP nonce, and `Permissions-Policy: camera=(self "https://api.sumsub.com"), microphone=(self "https://api.sumsub.com")`. `404` (rendered as an HTML page that emits `sessionExpired`) for an unknown session, one belonging to a different provider than the configured one, or one that is already terminal; `502` (same page) when the token cannot be minted.

### `POST /webhook/kyc/:provider`

| Response | Condition |
|----------|-----------|
| `404 {"error":"Unknown provider"}` | `:provider` is not a known provider, or not the configured one |
| `401 {"error":"Unauthorized"}` | `verifyWebhook` returned false |
| `400 {"error":"Invalid payload"}` | `parseWebhookEvent` returned null |
| `200 {"received":true,"outcome":"…"}` | Any of the six outcomes in [backend.md](backend.md#webhook-processing) |
| `500 {"error":"Processing failed"}` | Persistence failed - the provider should retry |

Signature headers: `x-payload-digest` with optional `x-payload-digest-alg` (`HMAC_SHA1_HEX`, `HMAC_SHA256_HEX`, `HMAC_SHA512_HEX`, default `HMAC_SHA256_HEX`) for Sumsub; `X-Mock-Signature` (hex HMAC-SHA256 with `MOCK_WEBHOOK_SECRET`) for the mock provider.

## Authentication

`Authorization: Bearer <token>`. With `JWT_SECRET` set, the token is verified as an HS256 JWT and its `sub` claim becomes the `userId`. Without it, development treats the raw token as the userId and production treats every request as unauthenticated - fail-closed. See [security.md](security.md).

## Status values

`initial` → `incomplete` → `pending` → one of `approved` / `declined` / `finallyRejected`. `approved` and `finallyRejected` are **terminal** and can never be downgraded. `declined` is not terminal: a retryable rejection lets the applicant resubmit.

## Audit log actions

`session_created`, `token_refreshed`, `status_updated`, `webhook_rejected`, `creation_failed`. Metadata is restricted to a nine-key allow-list (`userId`, `provider`, `platform`, `levelName`, `status`, `previousStatus`, `source`, `errorCode`, `reason`) - see [data-models.md](data-models.md).
