import { resolvers } from '../src/schema';

describe('resolvers.Query.health', () => {
  it('reports ok with an ISO timestamp', () => {
    const result = resolvers.Query.health();
    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
