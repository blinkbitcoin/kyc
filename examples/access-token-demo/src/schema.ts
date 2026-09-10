// The host's own GraphQL API with the one mutation added. Everything else
// here (types, auth in the context) stands in for what the host already has.

import { levelFor } from './level';
import type { StartSession } from './session';

export interface Context {
  // The caller, resolved by the host's own session handling (see server.ts)
  userId: string | null;
  startSession: StartSession;
}

export const typeDefs = `#graphql
  "Where the verification runs - selects the provider token flavour"
  enum VerificationPlatform {
    WEB
    IOS
    ANDROID
  }

  type AccessToken {
    "Hand this to createSumsubNativeSource({ getAccessToken }) in the app"
    accessToken: String!
    provider: String!
    "The provider's applicant id, once the provider knows one (Sumsub does not yet)"
    applicantId: String
    expiresAt: String
  }

  type Query {
    health: String!
  }

  type Mutation {
    """
    Mint a provider access token for the caller, for the level the host maps
    \`tier\` onto. The SDK calls the app's getAccessToken again when it expires,
    so this mutation is also the refresh.
    """
    verificationAccessToken(platform: VerificationPlatform!, tier: String!): AccessToken!
  }
`;

export const resolvers = {
  Query: { health: () => 'ok' },
  Mutation: {
    verificationAccessToken: async (
      _parent: unknown,
      args: { platform: 'WEB' | 'IOS' | 'ANDROID'; tier: string },
      context: Context,
    ) => {
      if (!context.userId) {
        throw new Error('Unauthenticated');
      }
      const levelName = levelFor(args.tier);
      const session = await context.startSession(
        context.userId,
        args.platform,
        levelName,
      );
      return {
        accessToken: session.accessToken,
        provider: process.env.KYC_PROVIDER || 'sumsub',
        applicantId: session.providerApplicantId ?? null,
        expiresAt: session.expiresAt ?? null,
      };
    },
  },
};
