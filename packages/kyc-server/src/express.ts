// @blinkbitcoin/kyc-server/express - the HTTP surface as a mountable Express
// router: the hosted verification page, the provider webhook and a health
// check. The host owns authentication, CORS, rate limits and its GraphQL
// server (createKycGraphQL gives it the schema); this router owns the HTTP
// semantics of the kyc endpoints.
//
// `express` is an optional peer: only this entry imports it.

import express, { type RequestHandler, type Response, Router } from 'express';
import {
  type HostedPageHttpResult,
  hostedPageHttp,
  processWebhookHttp,
} from './handlers';
import type { Logger } from './log';
import type { VerificationProvider } from './provider';
import type { VerificationService } from './sessions';

export interface KycRouterMiddleware {
  // Applied to GET /hosted/:sessionId (e.g. a rate limit)
  hosted?: RequestHandler[];
  // Applied to POST /webhook/kyc/:provider (e.g. a rate limit)
  webhook?: RequestHandler[];
}

export interface KycRouterOptions {
  sessions: Pick<VerificationService, 'hostedPage' | 'handleWebhookEvent'>;
  provider: Pick<
    VerificationProvider,
    'hostedPage' | 'verifyWebhook' | 'parseWebhookEvent'
  >;
  // The name the provider is registered under: only that provider may
  // deliver webhooks, so a mock payload can never drive a Sumsub deployment
  providerName: string;
  middleware?: KycRouterMiddleware;
  // Text body cap for the webhook - provider payloads are small, so a tight
  // limit bounds naive payload-flood DoS (default 64kb)
  bodyLimit?: string;
  logger?: Logger;
}

/**
 * Send a hosted page under its headers. An app-wide helmet() is right for a
 * JSON API but wrong for an embeddable page: X-Frame-Options and the
 * cross-origin isolation headers would stop a host WebView or iframe from
 * loading it, and the default CSP has no nonce. Both are overridden here.
 */
export const sendHostedPage = (
  res: Response,
  page: HostedPageHttpResult,
): void => {
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Resource-Policy');
  for (const [name, value] of Object.entries(page.headers)) {
    res.setHeader(name, value);
  }
  res.status(page.status).type('html').send(page.html);
};

export const createKycRouter = (options: KycRouterOptions): Router => {
  const { sessions, provider, providerName, logger } = options;
  const bodyLimit = options.bodyLimit ?? '64kb';
  const middleware = options.middleware ?? {};
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // The hosted page. The unguessable session id is the capability: the URL
  // is handed to exactly one client by the start mutation, the page is never
  // cached, and the token it embeds is minted fresh per render.
  router.get(
    '/hosted/:sessionId',
    ...(middleware.hosted ?? []),
    async (req, res) => {
      sendHostedPage(
        res,
        await hostedPageHttp({
          sessionId: req.params.sessionId as string,
          sessions,
          provider,
        }),
      );
    },
  );

  // Provider webhook. Signature verification and payload parsing belong to
  // the provider; the raw body (exact bytes) is what gets signed.
  router.post(
    '/webhook/kyc/:provider',
    ...(middleware.webhook ?? []),
    express.text({ type: 'application/json', limit: bodyLimit }),
    async (req, res) => {
      if (req.params.provider !== providerName) {
        res.status(404).json({ error: 'Unknown provider' });
        return;
      }
      const result = await processWebhookHttp({
        provider,
        sessions,
        headers: req.headers,
        rawBody: typeof req.body === 'string' ? req.body : '',
        ip: req.ip,
        logger,
      });
      res.status(result.status).json(result.body);
    },
  );

  return router;
};
