# Security Model - blinkbitcoin/kyc

**Updated:** 2026-09-06

This is the threat model and the controls, across the packages and the reference backend. It is the document `SECURITY.md` points at.

## What this library handles

Identity documents, selfies and liveness video - the highest-sensitivity personal data most apps will ever touch. The architectural answer is that **none of it flows through this repo**: the applicant's camera stream and documents go from the device or browser straight to the provider, either in-process (mode 1) or inside the provider's own SDK on the hosted page (mode 2). `examples/full-service-demo` stores an applicant id and a status, never a document, an image, or a name.

## Known limitations

- The hosted session URL carries no max-age; only a terminal status retires it (see `docs/integration/hosted.md`, Known limitations).
- `SumsubProvider.getStatus` maps any Sumsub `4xx` other than `404` and `429` (so `401`/`403` included) to `VALIDATION_ERROR` rather than a dedicated credential error, so a rotated or revoked app token surfaces as a validation failure on `verificationSession` queries. Check the API logs for the upstream status.

## Boot-time enforcement (fail-closed)

`validateSecurityConfig` runs before the server binds a port. It refuses to start when **any** of these holds:

- `JWT_SECRET` is unset;
- with `KYC_PROVIDER=sumsub`, any of `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET` is unset;
- `PUBLIC_BASE_URL` is unset, or set but not an absolute `http(s)` URL.

Every missing item is listed in one error rather than one per restart. The single escape hatch is `ALLOW_INSECURE_DEV=true`, which prints a loud warning and must never be set in production; `examples/full-service-demo/.env.test` sets it because the test suites run against the mock provider with no secrets. Selecting `KYC_PROVIDER=mock` itself requires the same flag (`assertMockProviderAllowed`), since the mock provider signs its own webhooks with a key that defaults to `"mock"`.

## Authentication and authorization

- `Authorization: Bearer <token>`. With `JWT_SECRET`, the token is verified as HS256 and `sub` becomes the `userId`. Without it: development treats the raw token as the userId (convenient for the demos, which send `demo-user`), production treats the request as unauthenticated.
- Every session read and every refresh is **owner-scoped** (`getSessionByIdForUser`). A session belonging to another user returns `SESSION_NOT_FOUND`, not `UNAUTHORIZED` - the two are deliberately indistinguishable to the caller.
- The provider's own session id is never returned over GraphQL.

## Webhooks

- The body is read as raw text, because the signature covers the bytes, not a re-serialized object.
- `verifyHexDigest` compares with `timingSafeEqualString`, rejects an unrecognized digest algorithm (checked with `Object.hasOwn` against the allow-list, not a plain lookup, so an inherited `Object.prototype` key like `constructor` can never pass), rejects a blank or missing signature, and - when no secret is configured and `ALLOW_INSECURE_DEV` is not set - logs a `Security event:` line and returns false rather than accepting.
- `POST /webhook/kyc/:provider` 404s unless the segment is both a known provider and the configured one, so a mock payload cannot drive a Sumsub deployment.
- **Terminal-state guard:** `approved` and `finallyRejected` never downgrade. A replayed or out-of-order callback that would do so is answered `200` and recorded as `webhook_rejected` with `reason: 'terminal_status'`. The guard is part of the conditional `UPDATE` itself (`WHERE status NOT IN (terminal)`), not a check-then-write, so two concurrent deliveries cannot both pass a check and then both write. There is no separate replay-window check on webhook delivery; the state machine's terminal guard and idempotent binding are what limit the damage a replay can do.
- Rate limit 120/min, body limit 64 kb.

## The hosted page and the embedding boundary

- Strict per-request-nonce CSP: `default-src 'none'`, scripts only from the nonce and `https://static.sumsub.com`, connections only to the provider, `base-uri 'none'`, `form-action 'none'`.
- `Permissions-Policy: camera=(self "https://api.sumsub.com"), microphone=(self "https://api.sumsub.com")` - capture is delegated to the provider frame and nothing else.
- `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- `frame-ancestors *` with `X-Frame-Options` and the `Cross-Origin-*` headers removed is **deliberate**: the page's whole purpose is to be embedded by a host app whose origin the service does not know. The channel is authenticated on the client side instead - see below. This is a documented tradeoff: the page itself posts outbound messages with target origin `'*'` and does not check `event.origin` on inbound ones except for the `source` / `v` discriminator on `setToken` - the receiving side (the host's WebView or iframe wrapper), not the page, is where the trust boundary is actually drawn.
- The access token is minted per render and never stored in the page's URL.
- An unknown session, one belonging to a different provider than the one configured, or one that is already terminal all get the same not-found page (`404`) rather than a token mint attempt.

### The client-side origin pin is the real control

- **Web:** a message is accepted only when `event.origin === session.allowedOrigin` **and** `event.source` is the exact `contentWindow` of the frame that was rendered. Origin alone is insufficient, because another frame on the page could be navigated to the same origin. With no `allowedOrigin`, everything is rejected and token refresh is disabled - it never falls back to `postMessage(..., '*')`.
- **React Native:** `originWhitelist = [origin, ...allowedNavigationOrigins]` plus an `onShouldStartLoadWithRequest` navigation guard restrict navigation to the session origin and explicitly declared provider frames; `setSupportMultipleWindows={false}`, `allowFileAccess={false}` and `cacheEnabled={false}` close the obvious escapes. This is defense in depth rather than a hard sandbox: react-native-webview checks `originWhitelist` first and opens a miss in the system browser instead of consulting the guard, the guard itself runs for subframes too, and on Android an unanswered guard is allowed through after 250 ms.
- **Both:** `interpretBridgeMessage` rejects any payload whose `source` is not `kyc-bridge` or whose `v` is not the supported protocol version, which is what keeps the provider's own `postMessage` traffic out of the event stream.

## Transport and abuse controls

`helmet` on every response; per-route rate limits (`/graphql` 100/min, `/hosted/:sessionId` 60/min, the webhook 120/min); a 64 kb body limit; a CORS allow-list that is **empty by default** (no `CORS_ALLOWED_ORIGINS` means no cross-origin browser access at all); `trust proxy 1` only in production; GraphQL introspection and stack traces disabled in production.

## Logging and telemetry

Span attributes are ids, statuses and types: `kyc.provider`, `enduser.id`, `kyc.platform`, `kyc.session_id`, `kyc.status`, `kyc.webhook.*`. **Provider applicant ids are never span attributes.** Audit metadata is limited to a nine-key allow-list. No applicant name, document number, image or liveness frame is logged, traced or persisted anywhere in this repo.

## Input validation

`platform` must be one of the three enum values; `levelName` and `locale` must be non-empty when provided and are length-capped (100 and 35), and `locale` must also match `^[a-z]{2}(-[A-Z]{2})?$`; ids must be non-empty. Validation failures are `VALIDATION_ERROR` with a user-presentable message, which is the only error whose message is passed through to the UI verbatim.

## Supply chain

`audit-ci` runs in CI with `audit-ci.jsonc`; Dependabot keeps actions and dependencies current; CodeQL analyses the repo; publishing happens only from a green `main` run, and `scripts/release/registry-smoke.sh` installs the published artifact from GitHub Packages and asserts the consumer contract before anyone else does.

## Host-app responsibilities

This library cannot do these for you:

1. **Mint tokens server-side.** `getAccessToken` (mode 1) must call *your* backend. A provider app token in a mobile bundle is a compromised app token.
2. **Serve over HTTPS.** Browsers do not grant `getUserMedia` on plain HTTP, and neither WebView hardening nor an origin pin substitutes for transport security.
3. **Declare OS permissions.** `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `android.permission.CAMERA`, `android.permission.RECORD_AUDIO`.
4. **Keep your own `Permissions-Policy` permissive enough** that the iframe can be delegated `camera` / `microphone` - a frame can only receive a capability its embedder holds.
5. **Treat `onComplete` as advisory.** The user-visible status is a convenience; entitlement decisions belong on your backend, driven by the webhook-backed status, not by a client callback.

## Reporting

Private vulnerability reporting is described in [../../SECURITY.md](../../SECURITY.md).
