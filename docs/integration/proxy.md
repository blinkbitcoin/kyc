# Mode 3 - Proxy session

**Updated:** 2026-09-06

The backend owns the whole lifecycle: it creates the session, mints and refreshes the provider token, receives the provider's webhooks and holds the authoritative status. The client asks for a session and reports what happened.

This is the only mode that needs `@apollo/client` and `graphql`, and the only one that needs **this repo's** `examples/full-service-demo`.

## Install

```sh
npm i @blinkbitcoin/kyc-react-native @apollo/client graphql \
      react-native-webview @react-native-community/netinfo
# web: npm i @blinkbitcoin/kyc-react @apollo/client graphql
```

## Wiring

```tsx
import {
  createKycApolloClient,
  createProxySource,
  Verification,
} from '@blinkbitcoin/kyc-react-native';   // web: '@blinkbitcoin/kyc-react'

const client = createKycApolloClient({
  uri: 'https://api.example.com/graphql',
  getAuthToken: () => yourAuth.accessToken,   // sync or async, may return null
});

const source = createProxySource({
  client,
  platform: 'IOS',      // 'WEB' | 'IOS' | 'ANDROID'
  levelName: 'basic-kyc-level',   // optional
  locale: 'en',                   // optional - must look like "en" or "en-US"
});

<Verification
  source={source}
  onComplete={(result) => console.log(result.status)}
  onError={(error) => console.warn(error.code, error.message)}
  onCancel={() => navigation.goBack()}
/>;
```

`createKycApolloClient` builds an `ApolloClient` with an error link that logs coded GraphQL and network failures, a context link that sets `authorization: Bearer <token>` (and an empty header when the callback returns nothing), an `HttpLink` and an `InMemoryCache`. If you already have an Apollo client, pass it directly - `createProxySource` only needs something that can execute the three operations.

## What the source does

| Method | Operation | Behaviour |
|--------|-----------|-----------|
| `start()` | `verificationSessionStart` | Returns the full `VerificationSession`: `sessionId`, `provider`, `status`, `accessToken`, `url`, `allowedOrigin`, `applicantId`. An empty response is `SESSION_CREATION_FAILED`; any other failure keeps the server's code where there is one |
| `refreshToken(previous)` | `verificationSessionRefresh` | Needs `previous.sessionId`, otherwise `TOKEN_REFRESH_FAILED`. An empty token is the same failure |
| `interpret(message)` | - | `interpretBridgeMessage` - the returned `url` is a hosted page, so the same bridge applies |

The source is a `TokenRefreshableSource`, so `tokenExpired` refreshes in place rather than surfacing a Restart.

Errors are tagged with a private sentinel class rather than duck-typed on a `code` property, so a foreign coded error (a `DOMException` with `.code === 20`, a Node error with `.code === 'ECONNREFUSED'`) is never mistaken for one of ours and rethrown unmapped.

## Reading the status later

```ts
import { VERIFICATION_SESSION_QUERY } from '@blinkbitcoin/kyc-core';

const { data } = await client.query({
  query: VERIFICATION_SESSION_QUERY,
  variables: { id: sessionId },
  fetchPolicy: 'network-only',
});
```

The hook does **not** poll, deliberately: webhooks are the backend's source of truth, and a client that polls will happily report a status the backend has already superseded. Query when your own UI needs it - on a screen focus, on a pull-to-refresh - and treat `onComplete` as advisory. Entitlement decisions belong on your backend. (Behind the scenes, the query does make one best-effort reconciliation call to the provider when the stored status is not yet terminal - see [../architecture/api-contracts.md](../architecture/api-contracts.md#verificationsession) - but that is a self-heal, not a replacement for the webhook.)

## Running the reference backend

```bash
make db-up migrate backend        # dev Postgres on 5432, migrations, server on 4000
```

Minimum configuration for a real deployment:

```env
DATABASE_URL=postgresql://user:pass@host:5432/kyc
KYC_PROVIDER=sumsub
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET_KEY=...
SUMSUB_WEBHOOK_SECRET=...
JWT_SECRET=...
PUBLIC_BASE_URL=https://api.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
```

The service refuses to boot if any of the required secrets is missing (see [../architecture/security.md](../architecture/security.md)). For local work against the mock provider, `KYC_PROVIDER=mock` plus `ALLOW_INSECURE_DEV=true` is the intended shortcut and is what `examples/full-service-demo/.env.test` uses.

Register `https://api.example.com/webhook/kyc/sumsub` in the provider dashboard - without it, statuses never advance past `pending`. The full dashboard walkthrough is [sumsub.md](sumsub.md).

## Auth

The bearer token is your app's, not the provider's. With `JWT_SECRET` set, `examples/full-service-demo` verifies it as HS256 and uses the `sub` claim as the user id; every session read and refresh is owner-scoped against it. In development without `JWT_SECRET`, the raw token is the user id - which is why the demos simply send `demo-user`.

## Errors you should expect to handle

`UNAUTHORIZED` (re-authenticate), `VALIDATION_ERROR` (show the message as-is), `PROVIDER_UNAVAILABLE` and `SESSION_CREATION_FAILED` (retry - the built-in error screen already offers it), `SESSION_NOT_FOUND` (start over), `PERSISTENCE_FAILED` (retry). Full table: [error-codes.md](error-codes.md).
