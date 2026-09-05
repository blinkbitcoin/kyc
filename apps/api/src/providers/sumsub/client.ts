// Sumsub REST client: app-token request signing plus the three endpoints the
// adapter needs. Structured like esign's providers/docusign/client.ts (same
// HttpError / retry vocabulary), but the auth scheme is Sumsub's HMAC:
//
//   X-App-Token       the app token
//   X-App-Access-Ts   unix seconds
//   X-App-Access-Sig  hex HMAC-SHA256 of `<ts><METHOD><path+query><body>`
//                     keyed with the secret key
//
// The signature covers the path AND the query string, so every URL here is
// built once and passed through unchanged.

import crypto from 'crypto';

import { getConfig } from './config';
import type { SumsubReviewPayload } from './mapping';

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`HTTP ${status}: ${body}`);
    this.name = 'HttpError';
  }
}

export const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 500, // 500ms, 1s exponential backoff
};

export const isClientError = (error: unknown): boolean =>
  error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 429;

export const isNotFoundError = (error: unknown): boolean =>
  error instanceof HttpError && error.status === 404;

export const shouldRetry = (error: unknown): boolean =>
  !(error instanceof HttpError) || error.status >= 500 || error.status === 429;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const withRetry = async <T>(fn: () => Promise<T>, config = RETRY_CONFIG): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error)) {
        throw error;
      }
      if (attempt < config.maxAttempts - 1) {
        await sleep(config.baseDelay * 2 ** attempt);
      }
    }
  }

  throw lastError;
};

export interface SignPayloadArgs {
  ts: number;
  method: string;
  pathWithQuery: string;
  body: string;
  secretKey: string;
}

export const signPayload = ({
  ts,
  method,
  pathWithQuery,
  body,
  secretKey,
}: SignPayloadArgs): string =>
  crypto
    .createHmac('sha256', secretKey)
    .update(`${ts}${method.toUpperCase()}${pathWithQuery}${body}`, 'utf8')
    .digest('hex');

export const sumsubRequest = async <T>(
  method: string,
  pathWithQuery: string,
  body?: string
): Promise<T> => {
  const config = getConfig();
  if (!config.appToken) {
    throw new Error('Sumsub provider: SUMSUB_APP_TOKEN is not configured');
  }
  if (!config.secretKey) {
    throw new Error('Sumsub provider: SUMSUB_SECRET_KEY is not configured');
  }

  const ts = Math.floor(Date.now() / 1000);
  const response = await fetch(`${config.baseUrl}${pathWithQuery}`, {
    method: method.toUpperCase(),
    headers: {
      Accept: 'application/json',
      'X-App-Token': config.appToken,
      'X-App-Access-Ts': String(ts),
      'X-App-Access-Sig': signPayload({
        ts,
        method,
        pathWithQuery,
        body: body ?? '',
        secretKey: config.secretKey,
      }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    ...(body !== undefined && { body }),
  });

  if (!response.ok) {
    // The body may name the applicant; log the status only.
    console.error(`Sumsub request failed: ${method.toUpperCase()} HTTP ${response.status}`);
    throw new HttpError(response.status, await response.text());
  }

  return (await response.json()) as T;
};

export interface SumsubAccessToken {
  token: string;
  userId: string;
}

export const createAccessToken = async (
  externalUserId: string,
  levelName: string,
  ttlInSecs: number
): Promise<SumsubAccessToken> =>
  sumsubRequest<SumsubAccessToken>(
    'POST',
    `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}` +
      `&levelName=${encodeURIComponent(levelName)}&ttlInSecs=${ttlInSecs}`
  );

export const fetchApplicantStatus = async (applicantId: string): Promise<SumsubReviewPayload> =>
  sumsubRequest<SumsubReviewPayload>(
    'GET',
    `/resources/applicants/${encodeURIComponent(applicantId)}/status`
  );

export interface SumsubApplicant {
  applicantId: string;
  review: SumsubReviewPayload;
}

export const fetchApplicantByExternalUserId = async (
  externalUserId: string
): Promise<SumsubApplicant> => {
  const applicant = await sumsubRequest<{ id: string; review?: SumsubReviewPayload }>(
    'GET',
    `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`
  );
  return { applicantId: applicant.id, review: applicant.review ?? {} };
};
