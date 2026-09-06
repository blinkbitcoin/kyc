# @blinkbitcoin/kyc-sumsub

Sumsub provider adapters for [`@blinkbitcoin/kyc`](https://github.com/blinkbitcoin/kyc).
Three entries keep provider dependencies out of hosts that do not need them:

| Import | Contents | Peer needed |
|--------|----------|-------------|
| `@blinkbitcoin/kyc-sumsub` | Sumsub ↔ normalized mapping (pure TypeScript) | none |
| `@blinkbitcoin/kyc-sumsub/react-native` | `createSumsubNativeSource` over the Sumsub Mobile SDK | `@sumsub/react-native-mobilesdk-module` |
| `@blinkbitcoin/kyc-sumsub/web` | The mapping again; the web-SDK mount adapter is a follow-up (see below) | none in v1 |

The root entry is the single source of truth for Sumsub semantics: the
backend's webhook handler, the hosted page's status table and the React
Native source all read the same functions, so a rule is written once.

## Root entry

```ts
import {
  mapSumsubStatus,            // (reviewStatus?, reviewResult?) -> VerificationStatus
  mapSumsubWebhookType,       // (type, reviewStatus?, reviewResult?) -> VerificationStatus | null
  mapSumsubWebhookStatus,     // (webhookPayload) -> VerificationStatus | null
  mapSumsubMobileStatus,      // ('Approved' | ...) -> VerificationStatus | null
  mapSumsubMobileResult,      // (SNSMobileSDKResult) -> VerificationEvent
  interpretSumsubWebMessage,  // (type, payload) -> VerificationEvent | null
  SUMSUB_EVENT_NAMES,
  SUMSUB_PROVIDER,
  sumsubSession,
} from '@blinkbitcoin/kyc-sumsub';
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

## React Native (native SDK mode)

```sh
npm install @blinkbitcoin/kyc-sumsub @sumsub/react-native-mobilesdk-module
```

```tsx
import { Verification } from '@blinkbitcoin/kyc-react-native';
import { createSumsubNativeSource } from '@blinkbitcoin/kyc-sumsub/react-native';

const source = createSumsubNativeSource({
  // Your backend mints the access token. The SDK calls this again by itself
  // when the token expires - there is no refresh wiring to do.
  getAccessToken: async () => {
    const response = await fetch('https://api.example.com/kyc/token', {
      method: 'POST',
      headers: { authorization: `Bearer ${await getAuthToken()}` },
    });
    const { accessToken } = await response.json();
    return accessToken;
  },
  locale: 'en',   // optional; omitted -> the SDK decides
  debug: false,   // optional; true forwards SDK log lines to the console
});

<Verification
  source={source}
  onComplete={(result) => console.log(result.status, result.applicantId)}
  onError={(error) => console.warn(error.code, error.message)}
  onCancel={() => {}}
/>;
```

`createSumsubNativeSource` returns a `LaunchableSource`, so the component
launches the native SDK instead of rendering a WebView. `start()` rejects
with `SDK_UNAVAILABLE` when the optional peer is not installed; a failed
launch rejects with `SUMSUB_LAUNCH_FAILED`, and a provider error keeps its
identity (`SUMSUB_<ERRORTYPE>`, except `Unauthorized` → `TOKEN_EXPIRED` and
`NetworkError` → `NETWORK_ERROR`).

Closing the SDK without finishing is **not** an error and not a completion:
a launch that comes back `Initial` or `Incomplete` emits `{ type: 'cancel' }`
and still resolves, with that status as an advisory value (`onCancel` fires,
`onComplete` does not). Only a launch that reached a verdict — `Pending`,
`Approved`, `TemporarilyDeclined`, `FinallyRejected` — emits `complete`.
Two other guardrails: a session with no `accessToken` rejects with
`SUMSUB_LAUNCH_FAILED` before the SDK is built, and a second `launch()` while
one is still running rejects with `SDK_UNAVAILABLE` rather than racing the
first over the same screen.

### Testing without the native module

`__mocks__/@sumsub/react-native-mobilesdk-module.ts` in this package is a
complete fake of the builder chain (records `withHandlers` / `withDebug` /
`withLocale`, drives `onStatusChanged` / `onEvent` / `onLog`, resolves or
rejects `launch()`). Point your Jest at it:

```js
moduleNameMapper: {
  '^@sumsub/react-native-mobilesdk-module$':
    '<rootDir>/node_modules/@blinkbitcoin/kyc-sumsub/__mocks__/@sumsub/react-native-mobilesdk-module.ts',
}
```

Or inject a double directly: `createSumsubNativeSource({ getAccessToken, sdk })`.

## Web

v1 ships no `@sumsub/websdk` mount adapter. Sumsub's web SDK is itself an
iframe, so the hosted page served by this repo's `apps/api` already covers
the web path end to end. The `./web` subpath is reserved and currently
re-exports the mapping — including `interpretSumsubWebMessage`, which
normalizes the five `idCheck.*` messages if you mount the SDK yourself.

## Sumsub sandbox checklist (manual)

The real Sumsub sandbox is never exercised in CI. Before releasing a change
to the native source, run the React Native demo in `native` mode against a
sandbox level on a physical iPhone **and** a physical Android device, with
camera permission granted, denied, and at the first prompt. The full
step-by-step checklist lives in `docs/integration/sumsub.md`.
