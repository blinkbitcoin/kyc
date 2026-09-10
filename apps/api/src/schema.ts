// GraphQL schema and resolvers: the package's wire layer over this
// service's verification service.

import { createKycGraphQL } from '@blinkbitcoin/kyc-server';
import { verificationService } from './services';

export const { typeDefs, resolvers } = createKycGraphQL({ sessions: verificationService });
