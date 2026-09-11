// Apollo Server over the schema on Express, with the host's session handling
// in the context. This example accepts `Authorization: Bearer <userId>` as-is
// - a real host verifies its own session token here (the full-service demo
// shows an HS256 JWT check); the package never sees the token.

import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { bearerToken } from '@blinkbitcoin/kyc-node';
import express from 'express';
import { type Context, resolvers, typeDefs } from './schema';
import type { StartSession } from './session';

export const userFromAuthorization = (
  header: string | undefined,
): string | null => bearerToken(header);

export const createServer = (startSession: StartSession) => {
  const apollo = new ApolloServer<Context>({ typeDefs, resolvers });
  const app = express();
  const httpServer = createHttpServer(app);
  return {
    server: {
      stop: async () => {
        await apollo.stop();
        await new Promise<void>(resolve => {
          httpServer.close(() => resolve());
        });
      },
    },
    // Listen on a port (0 = any free port); resolves the GraphQL URL
    start: async (port: number): Promise<{ url: string }> => {
      await apollo.start();
      app.use(
        '/',
        express.json(),
        expressMiddleware(apollo, {
          context: async ({ req }): Promise<Context> => ({
            userId: userFromAuthorization(req.headers.authorization),
            startSession,
          }),
        }),
      );
      await new Promise<void>(resolve => {
        httpServer.listen(port, resolve);
      });
      // A listening TCP server always reports an AddressInfo
      const { port: bound } = httpServer.address() as AddressInfo;
      return { url: `http://localhost:${bound}/` };
    },
  };
};
