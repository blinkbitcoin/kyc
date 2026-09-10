// The GraphQL layer: the SDL is the client contract (its enums are the
// domain vocabulary and the ErrorCode wire contract), and the resolvers
// only map onto the verification service.

import {
  type EnumTypeDefinitionNode,
  type InputObjectTypeDefinitionNode,
  type ObjectTypeDefinitionNode,
  parse,
} from 'graphql';
import { ErrorCodes } from '../errors';
import { createKycGraphQL, typeDefs } from '../graphql';
import type { VerificationService } from '../sessions';
import { VERIFICATION_PLATFORMS, VERIFICATION_STATUSES } from '../types';

const doc = parse(typeDefs);

const objectType = (name: string): ObjectTypeDefinitionNode => {
  const node = doc.definitions.find(
    (d): d is ObjectTypeDefinitionNode =>
      d.kind === 'ObjectTypeDefinition' && d.name.value === name,
  );
  expect(node).toBeDefined();
  return node as ObjectTypeDefinitionNode;
};

const inputType = (name: string): InputObjectTypeDefinitionNode => {
  const node = doc.definitions.find(
    (d): d is InputObjectTypeDefinitionNode =>
      d.kind === 'InputObjectTypeDefinition' && d.name.value === name,
  );
  expect(node).toBeDefined();
  return node as InputObjectTypeDefinitionNode;
};

const enumValues = (name: string): string[] => {
  const node = doc.definitions.find(
    (d): d is EnumTypeDefinitionNode =>
      d.kind === 'EnumTypeDefinition' && d.name.value === name,
  );
  expect(node).toBeDefined();
  return ((node as EnumTypeDefinitionNode).values ?? []).map(v => v.name.value);
};

const fieldNames = (
  node: ObjectTypeDefinitionNode | InputObjectTypeDefinitionNode,
): string[] => (node.fields ?? []).map(f => f.name.value);

describe('the verification session SDL', () => {
  it('exposes the session query and the two session mutations', () => {
    expect(fieldNames(objectType('Query'))).toEqual([
      'health',
      'verificationSession',
    ]);
    expect(fieldNames(objectType('Mutation'))).toEqual([
      'verificationSessionStart',
      'verificationSessionRefresh',
    ]);
  });

  it('describes a session with everything a source needs, never the provider token material', () => {
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
    expect(fieldNames(inputType('VerificationSessionStartInput'))).toEqual([
      'platform',
      'levelName',
      'locale',
    ]);
  });

  it('enumerates the domain vocabulary, in order', () => {
    expect(enumValues('VerificationPlatform')).toEqual([
      ...VERIFICATION_PLATFORMS,
    ]);
    expect(enumValues('VerificationStatus')).toEqual([
      ...VERIFICATION_STATUSES,
    ]);
  });

  it('carries exactly the ErrorCodes as the wire contract (client codes never enter)', () => {
    const codes = enumValues('ErrorCode');
    expect([...codes].sort()).toEqual(Object.values(ErrorCodes).sort());
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

describe('createKycGraphQL', () => {
  const sessions = {
    start: jest.fn().mockResolvedValue({ sessionId: 's1' }),
    refresh: jest.fn().mockResolvedValue({ accessToken: 't2' }),
    status: jest.fn().mockResolvedValue({ sessionId: 's1', status: 'pending' }),
  } as unknown as VerificationService;
  const user = { userId: 'user-1' };

  it('returns the SDL and health with the injected clock, a real clock by default', () => {
    const { typeDefs: sdl, resolvers } = createKycGraphQL({
      sessions,
      now: () => new Date('2026-09-10T12:00:00Z'),
    });
    expect(sdl).toBe(typeDefs);
    expect(resolvers.Query.health()).toEqual({
      status: 'ok',
      timestamp: '2026-09-10T12:00:00.000Z',
    });
    const { timestamp } = createKycGraphQL({
      sessions,
    }).resolvers.Query.health();
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it('maps every operation onto the service with the context user', async () => {
    const { resolvers } = createKycGraphQL({ sessions });
    await expect(
      resolvers.Mutation.verificationSessionStart(
        undefined,
        { input: { platform: 'WEB' } },
        user,
      ),
    ).resolves.toEqual({ sessionId: 's1' });
    expect(sessions.start).toHaveBeenCalledWith('user-1', { platform: 'WEB' });

    await expect(
      resolvers.Mutation.verificationSessionRefresh(
        undefined,
        { sessionId: 's1' },
        user,
      ),
    ).resolves.toEqual({ accessToken: 't2' });
    expect(sessions.refresh).toHaveBeenCalledWith('user-1', 's1');

    await expect(
      resolvers.Query.verificationSession(
        undefined,
        { id: 's1' },
        { userId: null },
      ),
    ).resolves.toMatchObject({ status: 'pending' });
    expect(sessions.status).toHaveBeenCalledWith(null, 's1');
  });
});
