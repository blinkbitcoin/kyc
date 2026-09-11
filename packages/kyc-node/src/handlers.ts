// Framework-neutral HTTP handlers for the endpoints a host serves, as Fetch
// API Request → Response functions: mountable as a serverless / route handler
// (Vercel, Netlify, Next.js route handlers, Lambda via an adapter) with no
// Express. The decision logic (status codes, bodies, page headers) lives in
// the `*Http` functions and is shared with the Express router.

import { getErrorCode } from './errors';
import { consoleLogger, type Logger } from './log';
import {
  DEFAULT_PERMISSIONS_POLICY,
  type HostedPageParams,
  hostedPageCsp,
  hostedPageNonce,
  renderNotFoundPage,
} from './pages';
import type { VerificationProvider } from './provider';
import type { VerificationService } from './sessions';
import type { VerificationSessionStartInput, WebhookHeaders } from './types';

// An HTTP outcome, independent of the framework that sends it
export interface HttpResult {
  status: number;
  body: unknown;
}

// --- Sessions ------------------------------------------------------------------

// The HTTP status a coded domain error maps to; anything uncoded is a 500
const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  SESSION_NOT_FOUND: 404,
  SESSION_CREATION_FAILED: 502,
  PROVIDER_UNAVAILABLE: 502,
  PERSISTENCE_FAILED: 500,
};

const failed = (error: unknown, logger: Logger): HttpResult => {
  const code = getErrorCode(error);
  if (code && STATUS_BY_CODE[code]) {
    return {
      status: STATUS_BY_CODE[code],
      body: { error: code, message: (error as Error).message },
    };
  }
  logger.error(
    'Verification request failed:',
    error instanceof Error ? error.message : error,
  );
  return { status: 500, body: { error: 'INTERNAL_ERROR' } };
};

export interface StartHttpInput {
  // The authenticated caller, or null (→ 401)
  userId: string | null;
  // The parsed JSON body: { platform, levelName?, locale? }
  body: unknown;
  sessions: Pick<VerificationService, 'start'>;
  logger?: Logger;
}

// POST /verification/start semantics: the service's coded errors become
// their status (401, 400, 502, 500), else 200 + what a source needs
export const startSessionHttp = async (
  input: StartHttpInput,
): Promise<HttpResult> => {
  const logger = input.logger ?? consoleLogger;
  try {
    return {
      status: 200,
      body: await input.sessions.start(
        input.userId,
        input.body as VerificationSessionStartInput,
      ),
    };
  } catch (error) {
    return failed(error, logger);
  }
};

export interface RefreshHttpInput {
  userId: string | null;
  // The parsed JSON body: { sessionId }
  body: unknown;
  sessions: Pick<VerificationService, 'refresh'>;
  logger?: Logger;
}

// POST /verification/refresh semantics: 401 / 400 / 404 from the service,
// 502 when the provider cannot mint, else 200 { accessToken }
export const refreshSessionHttp = async (
  input: RefreshHttpInput,
): Promise<HttpResult> => {
  const logger = input.logger ?? consoleLogger;
  const sessionId = (input.body as { sessionId?: unknown } | undefined)
    ?.sessionId;
  try {
    return {
      status: 200,
      body: await input.sessions.refresh(
        input.userId,
        typeof sessionId === 'string' ? sessionId : '',
      ),
    };
  } catch (error) {
    return failed(error, logger);
  }
};

// --- Webhook -----------------------------------------------------------------

export interface WebhookHttpInput {
  provider: Pick<VerificationProvider, 'verifyWebhook' | 'parseWebhookEvent'>;
  sessions: Pick<VerificationService, 'handleWebhookEvent'>;
  headers: WebhookHeaders;
  // The exact bytes received (re-serializing would change the signature)
  rawBody: string;
  ip?: string;
  logger?: Logger;
}

// POST /webhook/kyc/<provider> semantics: 401 on a bad signature (a verifier
// that throws did not authenticate the request: 401, never a 500 that tells
// the caller the backend choked on its headers), 400 on an unparseable
// payload, 500 when processing fails (the provider retries; the handler is
// idempotent), else 200 { received: true, outcome }
export const processWebhookHttp = async (
  input: WebhookHttpInput,
): Promise<HttpResult> => {
  const logger = input.logger ?? consoleLogger;
  let verified = false;
  try {
    verified = input.provider.verifyWebhook(
      input.headers,
      input.rawBody,
      input.ip,
    );
  } catch (error) {
    logger.error(
      'Webhook signature verification error:',
      error instanceof Error ? error.message : error,
    );
  }
  if (!verified) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }
  const event = input.provider.parseWebhookEvent(input.rawBody);
  if (!event) {
    logger.error('Webhook error: invalid payload');
    return { status: 400, body: { error: 'Invalid payload' } };
  }
  try {
    const outcome = await input.sessions.handleWebhookEvent(event);
    return { status: 200, body: { received: true, outcome } };
  } catch (error) {
    logger.error(
      'Webhook processing error:',
      error instanceof Error ? error.message : error,
    );
    return { status: 500, body: { error: 'Processing failed' } };
  }
};

// --- Hosted page ---------------------------------------------------------------

export interface HostedPageHttpInput {
  sessionId: string;
  sessions: Pick<VerificationService, 'hostedPage'>;
  provider: Pick<VerificationProvider, 'hostedPage'>;
  // The CSP nonce for this response (a fresh one by default)
  nonce?: string;
}

export interface HostedPageHttpResult {
  status: 200 | 404 | 502;
  html: string;
  nonce: string;
  // The headers the page must go out under
  headers: {
    'Content-Security-Policy': string;
    'Permissions-Policy': string;
    'Referrer-Policy': 'no-referrer';
    'Cache-Control': 'no-store';
  };
}

// GET /hosted/:sessionId semantics: the provider's page for a live session
// with a token minted for this render; the not-found page (which tells the
// app to stop waiting) as 404 for a session that cannot be shown, 502 when
// the token cannot be minted; a provider without a page never renders one
export const hostedPageHttp = async (
  input: HostedPageHttpInput,
): Promise<HostedPageHttpResult> => {
  const nonce = input.nonce ?? hostedPageNonce();
  const page = input.provider.hostedPage;
  const headers = {
    'Content-Security-Policy': page?.csp?.(nonce) ?? hostedPageCsp(nonce),
    'Permissions-Policy': page?.permissionsPolicy ?? DEFAULT_PERMISSIONS_POLICY,
    'Referrer-Policy': 'no-referrer' as const,
    'Cache-Control': 'no-store' as const,
  };
  const decision = page
    ? await input.sessions.hostedPage(input.sessionId)
    : ({ kind: 'not_found', status: 404 } as const);
  if (decision.kind === 'not_found') {
    return {
      status: decision.status,
      html: renderNotFoundPage(nonce),
      nonce,
      headers,
    };
  }
  const { session } = decision;
  const params: HostedPageParams = {
    sessionId: session.id,
    userId: session.userId,
    accessToken: decision.accessToken,
    locale: session.locale ?? undefined,
    applicantId: session.providerApplicantId ?? undefined,
    nonce,
  };
  return { status: 200, html: page!.render(params), nonce, headers };
};

// --- Fetch API handlers ------------------------------------------------------

const json = (result: HttpResult): Response =>
  new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  });

// A body that is not JSON (an empty body is fine)
const INVALID_JSON = Symbol('invalid json');

const readJson = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return INVALID_JSON;
  }
};

const headersOf = (request: Request): WebhookHeaders => {
  const headers: WebhookHeaders = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
};

export interface SessionHandlerOptions {
  // The host's authentication: the caller's user id, or null (→ 401)
  authenticate: (request: Request) => string | null | Promise<string | null>;
  logger?: Logger;
}

export interface SessionStartHandlerOptions extends SessionHandlerOptions {
  sessions: Pick<VerificationService, 'start'>;
}

// POST /verification/start as a Fetch API handler
export const createSessionStartHandler = (
  options: SessionStartHandlerOptions,
): ((request: Request) => Promise<Response>) => {
  return async request => {
    const body = await readJson(request);
    if (body === INVALID_JSON) {
      return json({ status: 400, body: { error: 'Invalid JSON body' } });
    }
    return json(
      await startSessionHttp({
        userId: await options.authenticate(request),
        body,
        sessions: options.sessions,
        logger: options.logger,
      }),
    );
  };
};

export interface SessionRefreshHandlerOptions extends SessionHandlerOptions {
  sessions: Pick<VerificationService, 'refresh'>;
}

// POST /verification/refresh as a Fetch API handler
export const createSessionRefreshHandler = (
  options: SessionRefreshHandlerOptions,
): ((request: Request) => Promise<Response>) => {
  return async request => {
    const body = await readJson(request);
    if (body === INVALID_JSON) {
      return json({ status: 400, body: { error: 'Invalid JSON body' } });
    }
    return json(
      await refreshSessionHttp({
        userId: await options.authenticate(request),
        body,
        sessions: options.sessions,
        logger: options.logger,
      }),
    );
  };
};

export interface WebhookHandlerOptions {
  provider: Pick<VerificationProvider, 'verifyWebhook' | 'parseWebhookEvent'>;
  sessions: Pick<VerificationService, 'handleWebhookEvent'>;
  // The client IP for security logging (platform-specific; e.g. a header)
  clientIp?: (request: Request) => string | undefined;
  logger?: Logger;
}

// POST /webhook/kyc/<provider> as a Fetch API handler
export const createWebhookHandler = (
  options: WebhookHandlerOptions,
): ((request: Request) => Promise<Response>) => {
  return async request =>
    json(
      await processWebhookHttp({
        provider: options.provider,
        sessions: options.sessions,
        headers: headersOf(request),
        rawBody: await request.text(),
        ip: options.clientIp?.(request),
        logger: options.logger,
      }),
    );
};

export interface HostedPageHandlerOptions {
  sessions: Pick<VerificationService, 'hostedPage'>;
  provider: Pick<VerificationProvider, 'hostedPage'>;
  // The session id of a request (default: the last path segment)
  sessionId?: (request: Request) => string;
}

const lastPathSegment = (request: Request): string =>
  new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';

// GET /hosted/:sessionId as a Fetch API handler: the page under its headers
export const createHostedPageHandler = (
  options: HostedPageHandlerOptions,
): ((request: Request) => Promise<Response>) => {
  const sessionId = options.sessionId ?? lastPathSegment;
  return async request => {
    const result = await hostedPageHttp({
      sessionId: sessionId(request),
      sessions: options.sessions,
      provider: options.provider,
    });
    return new Response(result.html, {
      status: result.status,
      headers: {
        ...result.headers,
        'content-type': 'text/html; charset=utf-8',
      },
    });
  };
};
