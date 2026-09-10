# examples/access-token-demo - your API adds one mutation

The smallest server-side footprint for the native SDK mode (mode 1): an
existing GraphQL API (Apollo Server here, any framework works) adds one
mutation whose resolver makes one call into `@blinkbitcoin/kyc-server`. No
session store, no webhooks, no hosted page, no service to run - the shape
for a backend that already exists (Blink's API) and only needs to hand the
app a provider access token.

```
app ──(session token)──▶ your API ──verificationAccessToken(platform, tier)──▶ provider.createSession
                                     maps its own tier to a level               ▲ app token + secret, server-held
app ◀──── { accessToken } ◀─────────────────────────────────────────────────────┘
app runs the Sumsub Mobile SDK with the token:
  <Verification source={createSumsubNativeSource({ getAccessToken })} />
```

- `src/level.ts` - the host's own decision: which verification level a user
  goes through (keyed on a product tier here; a real host looks it up).
- `src/session.ts` - `providerFromEnv(...)` over the package registry with
  this host's Sumsub entry, then `provider.createSession`, the one package
  call. `KYC_PROVIDER=mock` swaps in the mock provider so the mutation runs
  with no Sumsub account.
- `src/schema.ts`, `src/server.ts` - stand-ins for what the host already
  has: its schema and its session handling. The bearer token is taken as the
  user id here; a real host verifies its own session in that spot.
- The app side of this shape (the source that calls the mutation, the SDK):
  [native-sdk.md](../../docs/integration/native-sdk.md).

The SDK asks the app's `getAccessToken` again when the token expires, so
this one mutation is also the refresh: no session id, nothing to store.

## Run

```sh
cp .env.example .env
make dev                     # http://localhost:5003 (PORT overrides), mock provider
curl -s http://localhost:5003 -H 'content-type: application/json' \
  -H 'authorization: Bearer user-1' \
  -d '{"query":"mutation { verificationAccessToken(platform: IOS, tier: \"basic\") { accessToken provider } }"}'
```

With `KYC_PROVIDER=sumsub` and the app token + secret key in `.env`
(`SUMSUB_*`, see [sumsub.md](../../docs/integration/sumsub.md)), the same
mutation mints a real access token for the user's external id; the app's
native SDK opens the verification with it.

## Test

```sh
make test          # Vitest, 100% coverage enforced (make coverage)
```

CI also boots this example with the mock provider and runs the mutation end
to end (`scripts/e2e/server-demos-smoke.sh`, `make e2e-server-demos`).

## The other server shape

[`full-service-demo`](../full-service-demo/README.md) runs the whole
service: sessions, the hosted page, webhooks, a Postgres store.
