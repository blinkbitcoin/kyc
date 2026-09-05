// GraphQL documents for the proxy mode. This module (and everything that
// imports it) pulls in @apollo/client - it must never be reachable from
// ./hosted or ./testing.

import { gql } from '@apollo/client/core';

export const VERIFICATION_SESSION_START_MUTATION = gql`
  mutation VerificationSessionStart($input: VerificationSessionStartInput!) {
    verificationSessionStart(input: $input) {
      sessionId
      provider
      status
      accessToken
      url
      allowedOrigin
      applicantId
    }
  }
`;

export const VERIFICATION_SESSION_REFRESH_MUTATION = gql`
  mutation VerificationSessionRefresh($sessionId: ID!) {
    verificationSessionRefresh(sessionId: $sessionId) {
      accessToken
    }
  }
`;

export const VERIFICATION_SESSION_QUERY = gql`
  query GetVerificationSession($id: ID!) {
    verificationSession(id: $id) {
      sessionId
      provider
      status
      applicantId
    }
  }
`;

export type {
  VerificationPlatform,
  VerificationSessionStartInput,
} from './generated/graphql';

export type {
  GetVerificationSessionQuery as GetVerificationSessionResult,
  VerificationSessionRefreshMutation as VerificationSessionRefreshResult,
  VerificationSessionStartMutation as VerificationSessionStartResult,
} from './generated/graphql';
