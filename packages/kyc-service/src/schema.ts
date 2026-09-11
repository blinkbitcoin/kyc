// GraphQL schema and resolvers: the package's wire layer over this
// service's verification service. A factory, so the resolvers close over
// the service the app built (which closes over the app's provider).

import { createKycGraphQL, type VerificationService } from '@blinkbitcoin/kyc-node';

export const createGraphQL = (sessions: VerificationService) => createKycGraphQL({ sessions });
