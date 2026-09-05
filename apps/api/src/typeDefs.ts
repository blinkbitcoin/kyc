// GraphQL SDL - kept free of runtime imports so tooling (schema emission,
// drift tests, client codegen) can load it without a database connection.
// Phase 1 carries only the health query and the ErrorCode wire contract;
// the verification session operations arrive with the backend phase.

export const typeDefs = `#graphql
  type Query {
    health: HealthCheck!
  }

  type HealthCheck {
    status: String!
    timestamp: String!
  }

  # Wire contract: every code a resolver can put in extensions.code.
  # Mirrored by src/errors.ts (tested) and regenerated into
  # packages/kyc-core/src/generated/error-code.ts by \`make codegen\`.
  enum ErrorCode {
    UNAUTHORIZED
    VALIDATION_ERROR
    PROVIDER_UNAVAILABLE
    SESSION_NOT_FOUND
    SESSION_CREATION_FAILED
    PERSISTENCE_FAILED
  }
`;
