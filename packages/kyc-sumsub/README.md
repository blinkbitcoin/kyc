# @blinkbitcoin/kyc-sumsub

Sumsub provider adapters for `@blinkbitcoin/kyc`. Three entries keep native
dependencies out of hosts that do not need them:

| Import | Contents | Peer needed |
|--------|----------|-------------|
| `@blinkbitcoin/kyc-sumsub` | Shared Sumsub ↔ normalized mapping (pure TS) | none |
| `@blinkbitcoin/kyc-sumsub/react-native` | `createSumsubNativeSource` over the Sumsub Mobile SDK | `@sumsub/react-native-mobilesdk-module` |
| `@blinkbitcoin/kyc-sumsub/web` | `createSumsubWebSource` over the Sumsub Web SDK | `@sumsub/websdk` |

Bootstrap status: the entries exist and publish; the adapters arrive in the
Sumsub phase.
