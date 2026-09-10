// Demo Apollo wiring: the library owns the link chain, the host app (this
// demo) owns the endpoint and token retrieval.

import { createKycApolloClient } from '@blinkbitcoin/kyc-react-native';

import { GRAPHQL_URL } from './config';

// No login flow exists in the demo, so it sends a fixed dev token; the
// backend's dev passthrough (JWT_SECRET unset / ALLOW_INSECURE_DEV=true)
// treats the raw bearer token as the userId. A real host app would read a
// JWT from secure storage here.
export const getAuthToken = (): string => 'demo-user';

export const apolloClient = createKycApolloClient({
  uri: GRAPHQL_URL,
  getAuthToken,
});
