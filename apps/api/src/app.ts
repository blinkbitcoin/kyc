import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { getUserIdFromAuthHeader } from './auth';
import { getAllowedOrigins } from './config';
import { resolvers, typeDefs } from './schema';
import { setActiveSpanAttributes } from './tracing';

const BODY_LIMIT = '64kb';

export interface GraphQLContext {
  userId: string | null;
}

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
  // unmodified rather than being disabled.
  app.use(helmet());

  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    introspection: !isProduction(),
    includeStacktraceInErrorResponses: false,
  });

  await server.start();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

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
