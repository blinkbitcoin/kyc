// Express app factory for testability: this service's policy (security
// headers, CORS allow-list, rate limits, JWT auth) around the package's
// GraphQL schema and Express router.

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { createKycRouter } from '@blinkbitcoin/kyc-server/express';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { getUserIdFromAuthHeader } from './auth';
import { getAllowedOrigins } from './config';
import { getProviderName, provider } from './providers';
import { resolvers, typeDefs } from './schema';
import { verificationService } from './services';
import { setActiveSpanAttributes } from './tracing';
import type { GraphQLContext } from './types';

export type { GraphQLContext };

const BODY_LIMIT = '64kb';

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

const corsOptions = (): cors.CorsOptions => {
  const allowed = getAllowedOrigins();
  return { origin: allowed.length > 0 ? allowed : false };
};

const makeRateLimiter = (windowMs: number, max: number) =>
  rateLimit({ windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false });

export const createApp = async (): Promise<express.Express> => {
  const app = express();

  if (isProduction()) {
    app.set('trust proxy', 1);
  }

  // JSON-only API (no HTML rendered here), so helmet's default CSP applies
  // unmodified; the hosted page (the package's router) replaces the headers
  // an embeddable page cannot carry, per response.
  app.use(helmet());

  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    introspection: !isProduction(),
    includeStacktraceInErrorResponses: false,
  });

  await server.start();

  // The kyc endpoints: /health, the hosted page and the provider webhook -
  // with this service's rate limits. The webhook limit is deliberately
  // looser than the GraphQL one: a provider that could not reach us retries
  // its backlog in a burst, and dropping those deliveries costs us status
  // updates we cannot re-request.
  app.use(
    createKycRouter({
      sessions: verificationService,
      provider,
      providerName: getProviderName(),
      middleware: {
        hosted: [makeRateLimiter(60_000, 60)],
        webhook: [makeRateLimiter(60_000, 120)],
      },
      bodyLimit: BODY_LIMIT,
    })
  );

  app.use(
    '/graphql',
    makeRateLimiter(60_000, 100),
    cors<cors.CorsRequest>(corsOptions()),
    express.json({ limit: BODY_LIMIT }),
    expressMiddleware(server, {
      context: async ({ req }) => {
        const userId = getUserIdFromAuthHeader(req.headers.authorization);
        if (userId) {
          setActiveSpanAttributes({ 'enduser.id': userId });
        }
        return { userId };
      },
    })
  );

  return app;
};
