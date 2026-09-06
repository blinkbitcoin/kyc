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

The full threat model and the controls - fail-closed boot, bearer-token auth
and owner-scoped reads, webhook signature verification with a terminal-state
guard, the client-side origin pin, the hosted page's CSP and
`Permissions-Policy`, rate limiting, PII-safe logging and audit metadata, and
the responsibilities that remain with the host app - are documented in
[docs/architecture/security.md](docs/architecture/security.md).

The short version: applicant documents, selfies and liveness video never pass
through this repository. They go from the device or browser straight to the
provider. `apps/api` stores an applicant id and a status, never an image, a
document number or a name.

## Supported versions

The latest published version of each package. Prereleases (`next` dist-tag)
are development snapshots and receive no separate support.
