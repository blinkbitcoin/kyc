// The verification-session wire contract. Resolvers land in the backend
// phase; this test pins the SDL the client packages generate against.

import {
  type EnumTypeDefinitionNode,
  type InputObjectTypeDefinitionNode,
  type ObjectTypeDefinitionNode,
  parse,
} from 'graphql';
import { typeDefs } from '../src/typeDefs';

const doc = parse(typeDefs);

const objectType = (name: string): ObjectTypeDefinitionNode => {
  const node = doc.definitions.find(
    (d): d is ObjectTypeDefinitionNode => d.kind === 'ObjectTypeDefinition' && d.name.value === name
  );
  expect(node).toBeDefined();
  return node as ObjectTypeDefinitionNode;
};

const inputType = (name: string): InputObjectTypeDefinitionNode => {
  const node = doc.definitions.find(
    (d): d is InputObjectTypeDefinitionNode =>
      d.kind === 'InputObjectTypeDefinition' && d.name.value === name
  );
  expect(node).toBeDefined();
  return node as InputObjectTypeDefinitionNode;
};

const enumValues = (name: string): string[] => {
  const node = doc.definitions.find(
    (d): d is EnumTypeDefinitionNode => d.kind === 'EnumTypeDefinition' && d.name.value === name
  );
  expect(node).toBeDefined();
  return ((node as EnumTypeDefinitionNode).values ?? []).map((v) => v.name.value);
};

const fieldNames = (node: ObjectTypeDefinitionNode | InputObjectTypeDefinitionNode): string[] =>
  (node.fields ?? []).map((f) => f.name.value);

describe('verification session SDL', () => {
  it('exposes the session query and the two session mutations', () => {
    expect(fieldNames(objectType('Query'))).toEqual(['health', 'verificationSession']);
    expect(fieldNames(objectType('Mutation'))).toEqual([
      'verificationSessionStart',
      'verificationSessionRefresh',
    ]);
  });

  it('describes a session with everything a source needs', () => {
    expect(fieldNames(objectType('VerificationSession'))).toEqual([
      'sessionId',
      'provider',
      'status',
      'accessToken',
      'url',
      'allowedOrigin',
      'applicantId',
    ]);
    expect(fieldNames(objectType('VerificationSessionStatus'))).toEqual([
      'sessionId',
      'provider',
      'status',
      'applicantId',
    ]);
    expect(fieldNames(objectType('AccessToken'))).toEqual(['accessToken']);
  });

  it('takes platform, level and locale on start', () => {
    expect(fieldNames(inputType('VerificationSessionStartInput'))).toEqual([
      'platform',
      'levelName',
      'locale',
    ]);
  });

  it('enumerates the three client platforms', () => {
    expect(enumValues('VerificationPlatform')).toEqual(['WEB', 'IOS', 'ANDROID']);
  });

  it('enumerates exactly the six normalized statuses (kyc-core vocabulary)', () => {
    // Mirrors VerificationStatus in packages/kyc-core/src/verification/types.ts.
    expect(enumValues('VerificationStatus')).toEqual([
      'initial',
      'incomplete',
      'pending',
      'approved',
      'declined',
      'finallyRejected',
    ]);
  });
});

describe('ErrorCode enum', () => {
  it('stays the schema-borne subset only (client codes never enter the wire contract)', () => {
    const codes = enumValues('ErrorCode');
    expect(codes).toEqual([
      'UNAUTHORIZED',
      'VALIDATION_ERROR',
      'PROVIDER_UNAVAILABLE',
      'SESSION_NOT_FOUND',
      'SESSION_CREATION_FAILED',
      'PERSISTENCE_FAILED',
    ]);
    for (const clientCode of [
      'NETWORK_ERROR',
      'PERMISSION_DENIED',
      'SDK_UNAVAILABLE',
      'TOKEN_EXPIRED',
      'TOKEN_REFRESH_FAILED',
      'BRIDGE_PROTOCOL',
    ]) {
      expect(codes).not.toContain(clientCode);
    }
  });
});
