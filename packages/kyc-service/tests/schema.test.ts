// The GraphQL layer is the package's, bound to the verification service the
// app built. The resolvers' rules are tested in the package; here the
// composition and the health query, over an in-memory store.

import { createMemorySessionStore, typeDefs as packageTypeDefs } from '@blinkbitcoin/kyc-node';
import { createMock } from '../src/providers/mock';
import { createGraphQL } from '../src/schema';
import { createServices } from '../src/services';

const provider = createMock({ ALLOW_INSECURE_DEV: 'true' });
const { resolvers, typeDefs } = createGraphQL(
  createServices({
    provider,
    providerName: 'mock',
    store: createMemorySessionStore(),
    publicBaseUrl: () => 'https://kyc.example.com',
  })
);

describe('schema', () => {
  it('is the package SDL with resolvers for every operation', () => {
    expect(typeDefs).toBe(packageTypeDefs);
    expect(Object.keys(resolvers.Query).sort()).toEqual(['health', 'verificationSession']);
    expect(Object.keys(resolvers.Mutation).sort()).toEqual([
      'verificationSessionRefresh',
      'verificationSessionStart',
    ]);
  });

  it('reports health with an ISO timestamp', () => {
    const result = resolvers.Query.health();
    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('routes an operation to the service with the context user', async () => {
    await expect(
      resolvers.Query.verificationSession(undefined, { id: 's' }, { userId: null })
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHORIZED' } });
  });
});
