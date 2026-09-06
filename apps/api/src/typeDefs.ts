// GraphQL SDL - kept free of runtime imports so tooling (schema emission,
// drift tests, client codegen) can load it without a database connection.
// Carries the verification-session contract the client packages generate
// against, plus the ErrorCode wire contract; every operation below has a
// resolver in schema.ts.

export const typeDefs = `#graphql
  type Query {
    health: HealthCheck!
    # Status of a session this backend brokered. Resolver: backend phase.
    verificationSession(id: ID!): VerificationSessionStatus!
  }

  type Mutation {
    # Create a verification session for the authenticated user and return
    # everything a VerificationSource needs to run it. Resolver: backend phase.
    verificationSessionStart(input: VerificationSessionStartInput!): VerificationSession!
    # Mint a fresh provider access token for an existing session (hosted mode
    # token refresh). Resolver: backend phase.
    verificationSessionRefresh(sessionId: ID!): AccessToken!
  }

  type HealthCheck {
    status: String!
    timestamp: String!
  }

  # Where the verification runs - selects the provider token flavour.
  enum VerificationPlatform {
    WEB
    IOS
    ANDROID
  }

  # Normalized applicant status. These are the SAME six values as
  # VerificationStatus in packages/kyc-core/src/verification/types.ts, so the
  # generated client type is assignable to the hand-written union.
  enum VerificationStatus {
    initial
    incomplete
    pending
    approved
    declined
    finallyRejected
  }

  input VerificationSessionStartInput {
    platform: VerificationPlatform!
    levelName: String
    locale: String
  }

  # SECURITY: the provider's own session id is intentionally NOT exposed.
  type VerificationSession {
    sessionId: ID!
    provider: String!
    status: VerificationStatus!
    accessToken: String
    url: String
    allowedOrigin: String
    applicantId: String
  }

  type VerificationSessionStatus {
    sessionId: ID!
    provider: String!
    status: VerificationStatus!
    applicantId: String
  }

  type AccessToken {
    accessToken: String!
  }

  # Wire contract: every code a resolver can put in extensions.code.
  # Mirrored by src/errors.ts (tested) and regenerated into
  # packages/kyc-core/src/generated/error-code.ts by \`make codegen\`.
  # Client-side-only codes (NETWORK_ERROR, PERMISSION_DENIED,
  # SDK_UNAVAILABLE, TOKEN_EXPIRED, TOKEN_REFRESH_FAILED, BRIDGE_PROTOCOL)
  # live in the packages' ClientErrorCodes map and never appear here.
  enum ErrorCode {
    UNAUTHORIZED
    VALIDATION_ERROR
    PROVIDER_UNAVAILABLE
    SESSION_NOT_FOUND
    SESSION_CREATION_FAILED
    PERSISTENCE_FAILED
  }
`;
