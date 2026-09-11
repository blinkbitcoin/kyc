// The GraphQL wire layer: the SDL (the contract the client packages codegen
// against) and the resolvers over a verification service. No Apollo
// dependency - a host hands `typeDefs` + `resolvers` to its own GraphQL
// server, with a context carrying the authenticated user id.

import type { VerificationService } from './sessions';
import type { VerificationSessionStartInput } from './types';

// Context type for the resolvers: the authenticated user, or null
export interface GraphQLContext {
  userId: string | null;
}

// GraphQL SDL - kept free of runtime imports so tooling (schema emission,
// drift tests, client codegen) can load it without a database connection.
// Carries the verification-session contract the client packages generate
// against, plus the ErrorCode wire contract; every operation below has a
// resolver in createKycGraphQL.
export const typeDefs = `#graphql
  type Query {
    health: HealthCheck!
    # Status of a session this backend brokered.
    verificationSession(id: ID!): VerificationSessionStatus!
  }

  type Mutation {
    # Create a verification session for the authenticated user and return
    # everything a VerificationSource needs to run it.
    verificationSessionStart(input: VerificationSessionStartInput!): VerificationSession!
    # Mint a fresh provider access token for an existing session (hosted mode
    # token refresh).
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

export interface KycGraphQLOptions {
  sessions: VerificationService;
  // Clock for the health query (injectable for tests)
  now?: () => Date;
}

// The SDL plus resolvers bound to a verification service. Every rule lives
// in the service; the resolvers only map GraphQL inputs and outputs.
export const createKycGraphQL = (options: KycGraphQLOptions) => {
  const { sessions } = options;
  const now = options.now ?? (() => new Date());

  const resolvers = {
    Query: {
      health: () => ({ status: 'ok', timestamp: now().toISOString() }),

      verificationSession: (
        _parent: unknown,
        { id }: { id: string },
        context: GraphQLContext,
      ) => sessions.status(context.userId, id),
    },

    Mutation: {
      verificationSessionStart: (
        _parent: unknown,
        { input }: { input: VerificationSessionStartInput },
        context: GraphQLContext,
      ) => sessions.start(context.userId, input),

      verificationSessionRefresh: (
        _parent: unknown,
        { sessionId }: { sessionId: string },
        context: GraphQLContext,
      ) => sessions.refresh(context.userId, sessionId),
    },
  };

  return { typeDefs, resolvers };
};
