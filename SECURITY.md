# Security Policy

## Reporting a Vulnerability

Please report vulnerabilities **privately** via GitHub's private vulnerability
reporting on this repository (Security tab → "Report a vulnerability").
Do not open public issues for security problems.

You can expect an acknowledgement within a few business days. Please include
reproduction steps and the affected package/version.

## Scope

- The published packages: `@blinkbitcoin/kyc-core`, `@blinkbitcoin/kyc-sumsub`,
  `@blinkbitcoin/kyc-react-native`, `@blinkbitcoin/kyc-react`
- The backend service in `apps/api`

## Security model

The backend is fail-closed by default (it refuses to boot without
`JWT_SECRET`, and without `SUMSUB_WEBHOOK_SECRET` once the Sumsub adapter is
active, unless `ALLOW_INSECURE_DEV=true` is explicitly set - see
`apps/api/src/config.ts`). The fuller threat model and controls (webhook
signature verification and replay guard, rate limiting, provider-ID
protection, PII-safe audit logging) land with the backend phases; until
`docs/architecture/security.md` exists, the intended design is in
[docs/superpowers/specs/2026-09-05-kyc-design.md](docs/superpowers/specs/2026-09-05-kyc-design.md).

## Supported versions

The latest published version of each package. Prereleases (`next` dist-tag)
are development snapshots and receive no separate support.
