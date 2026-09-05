// GraphQL schema and resolvers. Phase 1: health only.

export { typeDefs } from './typeDefs';

export const resolvers = {
  Query: {
    health: () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  },
};
