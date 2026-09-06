import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { getUserIdFromAuthHeader } from './auth';
import { getAllowedOrigins, getPublicBaseUrl } from './config';
import { getProviderName, isKnownProvider, provider } from './providers';
import { signMockWebhook } from './providers/mock';
import { resolvers, typeDefs } from './schema';
import { getSessionById } from './session';
import { setActiveSpanAttributes } from './tracing';
import type { GraphQLContext } from './types';
import { TERMINAL_STATUSES } from './types';
import {
  PERMISSIONS_POLICY,
  renderNotFoundPage,
  renderVerificationPage,
  verificationPageCsp,
} from './verificationPages';
import { handleWebhookEvent } from './webhook';

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

  /**
   * Send an HTML page with a per-response nonce CSP.
   *
   * The app-wide helmet() defaults are right for the JSON API but wrong for
   * an embeddable page: X-Frame-Options and the cross-origin isolation
   * headers would stop a host WebView or iframe from loading it, and the
   * default CSP has no nonce. Both are overridden here, per route.
   */
  const sendVerificationPage = (
    res: express.Response,
    html: string,
    nonce: string,
    providerName: string,
    status = 200
  ): void => {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.setHeader('Content-Security-Policy', verificationPageCsp(providerName, nonce));
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).type('html').send(html);
  };

  // The hosted page. The unguessable session id is the capability: the URL
  // is handed to exactly one client by verificationSessionStart, the page is
  // never cached, and the token it embeds is minted fresh per render (so a
  // stale start-time token can never reach the SDK).
  app.get(
    '/hosted/:sessionId',
    makeRateLimiter(60_000, 60),
    async (req: express.Request, res: express.Response) => {
      const nonce = crypto.randomBytes(16).toString('base64');
      const session = await getSessionById(req.params.sessionId as string);

      // A finished verification has nothing left to render, and minting a
      // provider token for it would hand out a live SDK session for an
      // applicant whose outcome is already final.
      // NOTE: there is no max-age on the URL yet - the session id stays
      // usable for as long as the session is non-terminal.
      if (
        !session ||
        session.provider !== getProviderName() ||
        TERMINAL_STATUSES.has(session.status)
      ) {
        sendVerificationPage(res, renderNotFoundPage(nonce), nonce, getProviderName(), 404);
        return;
      }

      let accessToken: string;
      try {
        const token = await provider.refreshToken(
          { userId: session.userId, providerApplicantId: session.providerApplicantId ?? undefined },
          { platform: session.platform as 'WEB', levelName: session.levelName ?? undefined }
        );
        accessToken = token.accessToken;
      } catch (error) {
        console.error(
          'Hosted page token minting failed:',
          error instanceof Error ? error.message : error
        );
        sendVerificationPage(res, renderNotFoundPage(nonce), nonce, session.provider, 502);
        return;
      }

      const webhookUrl = `${getPublicBaseUrl()}/webhook/kyc/${session.provider}`;
      const mockBody = (status: string): string =>
        JSON.stringify({
          applicantId: session.providerApplicantId,
          externalUserId: session.userId,
          status,
        });

      sendVerificationPage(
        res,
        renderVerificationPage({
          sessionId: session.id,
          provider: session.provider,
          accessToken,
          locale: session.locale ?? undefined,
          applicantId: session.providerApplicantId ?? undefined,
          nonce,
          ...(session.provider === 'mock' && {
            webhooks: {
              approve: {
                url: webhookUrl,
                body: mockBody('approved'),
                signature: signMockWebhook(mockBody('approved')),
              },
              decline: {
                url: webhookUrl,
                body: mockBody('declined'),
                signature: signMockWebhook(mockBody('declined')),
              },
            },
          }),
        }),
        nonce,
        session.provider
      );
    }
  );

  app.post(
    '/webhook/kyc/:provider',
    makeRateLimiter(60_000, 120),
    express.text({ type: 'application/json', limit: BODY_LIMIT }),
    async (req: express.Request, res: express.Response) => {
      const providerName = req.params.provider as string;
      // Only the configured provider may deliver webhooks, so a mock payload
      // can never drive a Sumsub deployment.
      if (!isKnownProvider(providerName) || providerName !== getProviderName()) {
        res.status(404).json({ error: 'Unknown provider' });
        return;
      }

      const rawBody = typeof req.body === 'string' ? req.body : '';

      // A verifier that throws is a verifier that did not authenticate the
      // request: that is a 401, never a 500 that tells the caller the
      // backend choked on its headers.
      let verified = false;
      try {
        verified = provider.verifyWebhook(req.headers, rawBody, req.ip);
      } catch (error) {
        console.error(
          'Webhook signature verification error:',
          error instanceof Error ? error.message : error
        );
      }
      if (!verified) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const event = provider.parseWebhookEvent(rawBody);
      if (!event) {
        console.error('Webhook error: invalid payload');
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }

      try {
        const outcome = await handleWebhookEvent(event, providerName);
        res.status(200).json({ received: true, outcome });
      } catch (error) {
        console.error('Webhook processing error:', error instanceof Error ? error.message : error);
        res.status(500).json({ error: 'Processing failed' });
      }
    }
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
