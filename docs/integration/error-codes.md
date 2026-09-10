# Error Codes

**Updated:** 2026-09-06

Every failure surfaces through `onError({ code, message })` with a stable `code` and a user-presentable `message` produced by `getErrorMessage(code, serverMessage?)`, which also accepts unknown codes and degrades to a generic message. Codes come from two layers.

## Schema-borne codes (produced by the backend, proxy mode)

The `ErrorCode` GraphQL enum in `examples/full-service-demo/schema.graphql` is the wire contract; `make codegen` regenerates the client's copy and a parity test fails on drift.

| Code | Meaning | Sensible host reaction |
|------|---------|------------------------|
| `PERSISTENCE_FAILED` | The session row could not be written | Retry - the built-in error screen offers it |
| `PROVIDER_UNAVAILABLE` | The provider is down or erroring | Retry later; alert if persistent |
| `SESSION_CREATION_FAILED` | The provider rejected session creation (bad level name, misconfigured applicant) | Retry; check the level configuration if persistent |
| `SESSION_NOT_FOUND` | The session is unknown, or belongs to another user | Start over |
| `UNAUTHORIZED` | Bearer token missing or invalid | Re-authenticate the user |
| `VALIDATION_ERROR` | Input rejected (bad platform, level name, or locale); the message is user-friendly | Show `message` as-is |

Default copy: `UNAUTHORIZED` → "You are not authorized to start identity verification."; `VALIDATION_ERROR` → the server message, else "Invalid input. Please check your information."; `PROVIDER_UNAVAILABLE` → "Verification service temporarily unavailable. Please try again later."; `SESSION_NOT_FOUND` → "Verification session not found. Please start again."; `SESSION_CREATION_FAILED` → "Unable to start identity verification. Please try again."; `PERSISTENCE_FAILED` → "Your verification session could not be saved. Please try again."

## Client-side codes (produced by the packages, all modes)

| Code | Produced when | Sensible host reaction |
|------|--------------|------------------------|
| `BRIDGE_PROTOCOL` | The hosted page sent an `error` with no code, or a message the protocol does not understand | Update the app or the page - the two protocol versions disagree |
| `NETWORK_ERROR` | The embedding primitive failed to load the page (WebView `onError` / `onHttpError`, iframe load-error), or connectivity handling produced it | The built-in offline / error screen handles it |
| `PERMISSION_DENIED` | The camera permission was denied - by the host's `checkPermissions` preflight on React Native, or reported by the page's `idCheck.onError` on the web | The built-in permission screen handles it, with **Open settings** on React Native when you supply `onOpenSettings` (the web has no such affordance - browsers give no way to detect a permanently blocked permission) |
| `SDK_UNAVAILABLE` | The provider SDK peer is not installed in this build, or a mountable source's `mount` threw without a code | Ship the peer, or fall back to hosted mode |
| `TOKEN_EXPIRED` | The page reported `tokenExpired` with a non-refreshable source (or no `allowedOrigin`), or reported `sessionExpired` | The error screen offers **Restart**, which drops the session and starts a fresh one |
| `TOKEN_REFRESH_FAILED` | `refreshToken` rejected | Same - **Restart** |
| `UNKNOWN_ERROR` | Anything uncoded (an unexpected exception shape) | Generic retry |

Default copy: `NETWORK_ERROR` → "Connection lost. Please check your network and try again."; `PERMISSION_DENIED` → "Camera access is required to verify your identity."; `SDK_UNAVAILABLE` → "Identity verification is unavailable in this build."; `TOKEN_EXPIRED` → "Your verification session expired. Please start again."; `TOKEN_REFRESH_FAILED` → "Could not refresh your verification session. Please try again."; `BRIDGE_PROTOCOL` → "The verification page sent an unsupported message. Please update the app."; anything else → the server message, else "An error occurred. Please try again."

Provider-specific failures that map to none of the above arrive as `SUMSUB_<ERRORTYPE>` (for example `SUMSUB_APPLICANTMISCONFIGURED`, `SUMSUB_INITIALLOADINGFAILED`) or `SUMSUB_ERROR`. Two Mobile SDK error types do have a normalized meaning and are translated instead of passed through: `Unauthorized` becomes `TOKEN_EXPIRED` and `NetworkError` becomes `NETWORK_ERROR`. Everything else is pass-through by design: `getErrorMessage` degrades gracefully and you can log the raw code.

## Three things that are deliberately not errors

- **A rejected verification is not an error.** `declined` and `finallyRejected` arrive through `onComplete`, with the outcome screen already explaining the difference. Only a *failure of the flow* is an error.
- **Offline is not an error.** `navigator.onLine` being false, or NetInfo reporting no connectivity, parks on the offline screen with a retry affordance and never calls `onError`.
- **A denied permission is not an error.** Same reasoning: it is a recoverable user state with its own screen.

Message copy for every code lives in `getErrorMessage` (`@blinkbitcoin/kyc-core`), which hosts can call directly to render their own error surfaces consistently.
