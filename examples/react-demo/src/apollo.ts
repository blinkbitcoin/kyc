// Demo Apollo wiring: the library owns the link chain, the host app owns the
// endpoint and token retrieval (same split as the React Native demo).
import { createKycApolloClient } from '@blinkbitcoin/kyc-react';

import { GRAPHQL_URL } from './config';

// No login flow exists in the demo; the backend's dev passthrough treats this
// fixed bearer token as the userId.
export const getAuthToken = (): string => 'demo-user';

export const apolloClient = createKycApolloClient({
  uri: GRAPHQL_URL,
  getAuthToken,
});
