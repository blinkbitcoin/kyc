// Apollo client factory for proxy mode. The host app owns the auth token;
// this module only wires it into every request. Importing this file pulls in
// the optional @apollo/client peer, so it must stay out of ./hosted and
// ./testing.

import { ApolloClient, InMemoryCache, from } from '@apollo/client/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { SetContextLink } from '@apollo/client/link/context';
import { ErrorLink } from '@apollo/client/link/error';
import { HttpLink } from '@apollo/client/link/http';

/** Host seam: return the current bearer token (or nothing when signed out). */
export type GetAuthToken = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

export const handleApolloErrors: ErrorLink.ErrorHandler = ({ error }) => {
  if (CombinedGraphQLErrors.is(error)) {
    error.errors.forEach(({ message, extensions }) => {
      console.error(`[GraphQL error]: ${extensions?.code} - ${message}`);
    });
  } else {
    console.error(`[Network error]: ${error}`);
  }
};

export const createAuthContextSetter =
  (getAuthToken?: GetAuthToken): SetContextLink.ContextSetter =>
  // Both of the setter's parameters are declared (the operation goes
  // unused): callers pass both, and a declared-arity mismatch is what
  // CodeQL's js/superfluous-trailing-arguments reports
  async ({ headers }, _operation) => {
    const token = getAuthToken ? await getAuthToken() : null;
    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : '',
      },
    };
  };

export interface KycApolloClientOptions {
  /** The verification backend's GraphQL endpoint. */
  uri: string;
  getAuthToken?: GetAuthToken;
}

export const createKycApolloClient = ({
  uri,
  getAuthToken,
}: KycApolloClientOptions): ApolloClient =>
  new ApolloClient({
    link: from([
      new ErrorLink(handleApolloErrors),
      new SetContextLink(createAuthContextSetter(getAuthToken)),
      new HttpLink({ uri }),
    ]),
    cache: new InMemoryCache(),
  });

/**
 * Extract a GraphQL error code from an Apollo rejection. Apollo Client 4
 * wraps server-side errors in CombinedGraphQLErrors (an `errors` array);
 * anything else (network failure, thrown value) gets the caller's fallback.
 */
export const getApolloErrorCode = (
  error: unknown,
  fallback: string,
): string => {
  if (CombinedGraphQLErrors.is(error)) {
    return (
      (error.errors[0]?.extensions?.code as string | undefined) || fallback
    );
  }
  return fallback;
};
