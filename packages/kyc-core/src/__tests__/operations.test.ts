/**
 * The GraphQL documents the proxy source sends. Their shapes are checked
 * against examples/full-service-demo/schema.graphql by `npm run codegen` (which fails on a
 * field the schema does not have), so this test pins names and operation
 * kinds only.
 */

import type { OperationDefinitionNode } from 'graphql';

import {
  VERIFICATION_SESSION_QUERY,
  VERIFICATION_SESSION_REFRESH_MUTATION,
  VERIFICATION_SESSION_START_MUTATION,
} from '../operations';

const definition = (document: {
  definitions: readonly unknown[];
}): OperationDefinitionNode =>
  document.definitions[0] as OperationDefinitionNode;

describe('operations', () => {
  it('exports the session start mutation', () => {
    expect(VERIFICATION_SESSION_START_MUTATION.kind).toBe('Document');
    expect(definition(VERIFICATION_SESSION_START_MUTATION).operation).toBe(
      'mutation',
    );
    expect(definition(VERIFICATION_SESSION_START_MUTATION).name?.value).toBe(
      'VerificationSessionStart',
    );
  });

  it('exports the token refresh mutation', () => {
    expect(VERIFICATION_SESSION_REFRESH_MUTATION.kind).toBe('Document');
    expect(definition(VERIFICATION_SESSION_REFRESH_MUTATION).operation).toBe(
      'mutation',
    );
    expect(definition(VERIFICATION_SESSION_REFRESH_MUTATION).name?.value).toBe(
      'VerificationSessionRefresh',
    );
  });

  it('exports the session status query', () => {
    expect(VERIFICATION_SESSION_QUERY.kind).toBe('Document');
    expect(definition(VERIFICATION_SESSION_QUERY).operation).toBe('query');
    expect(definition(VERIFICATION_SESSION_QUERY).name?.value).toBe(
      'GetVerificationSession',
    );
  });
});
