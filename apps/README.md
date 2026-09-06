# apps/

| App | Role |
|-----|------|
| [`api/`](api/README.md) | 🖥️ The reference identity-verification backend: Express 5 + Apollo Server 5 + Knex/PostgreSQL. The `VerificationProvider` port with `mock` and `sumsub` adapters, session issuance and refresh, the signed webhook with its terminal-state guard, and the hosted verification page |

The backend is **required for mode 3 only**, and is also the mock provider
that drives every E2E suite in the repo - which is why the backend, web and
mobile suites can run with no provider credentials at all.

```bash
make db-up migrate backend   # dev Postgres, migrations, server on :4000
make e2e-backend             # the backend E2E suite, test DB lifecycle included
```

Architecture: [docs/architecture/backend.md](../docs/architecture/backend.md).
Wire contract: [docs/architecture/api-contracts.md](../docs/architecture/api-contracts.md).
