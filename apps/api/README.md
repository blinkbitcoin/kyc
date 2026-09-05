# api

Reference identity-verification backend (Express 5 + Apollo Server 5 +
Knex/Postgres). Bootstrap status: `GET /health`, the GraphQL `health` query,
the `ErrorCode` wire contract (`schema.graphql`, emitted from
`src/typeDefs.ts`) and the first migration. The `VerificationProvider` port,
mock + Sumsub adapters, webhook and hosted page land in the backend phase.

`make help` in this directory lists the local targets; the repo-wide E2E
flow is `make e2e-backend` at the root.
