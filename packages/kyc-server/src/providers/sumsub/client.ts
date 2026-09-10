// Sumsub REST client: app-token request signing plus the three endpoints the
// adapter needs. The auth scheme is Sumsub's HMAC:
//
//   X-App-Token       the app token
//   X-App-Access-Ts   unix seconds
//   X-App-Access-Sig  hex HMAC-SHA256 of `<ts><METHOD><path+query><body>`
//                     keyed with the secret key
//
// The signature covers the path AND the query string, so every URL here is
// built once and passed through unchanged.

import type { SumsubReviewPayload } from '@blinkbitcoin/kyc-core/sumsub';
import { createHmac } from 'node:crypto';
import { HttpError } from '../../http';
import { consoleLogger, type Logger } from '../../log';
import type { FetchLike } from '../../types';
import type { SumsubConfig } from './config';

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
  createHmac('sha256', secretKey)
    .update(`${ts}${method.toUpperCase()}${pathWithQuery}${body}`, 'utf8')
    .digest('hex');

export interface SumsubAccessToken {
  token: string;
  userId: string;
}

export interface SumsubApplicant {
  applicantId: string;
  review: SumsubReviewPayload;
}

export interface SumsubClient {
  request<T>(method: string, pathWithQuery: string, body?: string): Promise<T>;
  createAccessToken(
    externalUserId: string,
    levelName: string,
    ttlInSecs: number,
  ): Promise<SumsubAccessToken>;
  fetchApplicantStatus(applicantId: string): Promise<SumsubReviewPayload>;
  fetchApplicantByExternalUserId(
    externalUserId: string,
  ): Promise<SumsubApplicant>;
}

export interface SumsubClientOptions {
  // fetch, late-bound so hosts and tests can inject one (Node 18+ ships fetch)
  fetch?: FetchLike;
  logger?: Logger;
  // Unix seconds, injectable for deterministic signatures in tests
  now?: () => number;
}

export const createSumsubClient = (
  config: SumsubConfig | (() => SumsubConfig),
  options: SumsubClientOptions = {},
): SumsubClient => {
  const resolveConfig = typeof config === 'function' ? config : () => config;
  const fetchImpl: FetchLike =
    options.fetch ?? ((input, init) => fetch(input, init));
  const logger = options.logger ?? consoleLogger;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  const request = async <T>(
    method: string,
    pathWithQuery: string,
    body?: string,
  ): Promise<T> => {
    const current = resolveConfig();
    if (!current.appToken) {
      throw new Error('Sumsub provider: SUMSUB_APP_TOKEN is not configured');
    }
    if (!current.secretKey) {
      throw new Error('Sumsub provider: SUMSUB_SECRET_KEY is not configured');
    }

    const ts = now();
    const response = await fetchImpl(`${current.baseUrl}${pathWithQuery}`, {
      method: method.toUpperCase(),
      // Without this a hung Sumsub connection holds a request (and, on the
      // hosted page, a browser) open until the platform's own default.
      signal: AbortSignal.timeout(current.requestTimeoutMs),
      headers: {
        Accept: 'application/json',
        'X-App-Token': current.appToken,
        'X-App-Access-Ts': String(ts),
        'X-App-Access-Sig': signPayload({
          ts,
          method,
          pathWithQuery,
          body: body ?? '',
          secretKey: current.secretKey,
        }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(body !== undefined && { body }),
    });

    if (!response.ok) {
      // The body may name the applicant; log the status only.
      logger.error(
        `Sumsub request failed: ${method.toUpperCase()} HTTP ${response.status}`,
      );
      throw new HttpError(response.status, await response.text());
    }

    return (await response.json()) as T;
  };

  return {
    request,

    createAccessToken: (externalUserId, levelName, ttlInSecs) =>
      request<SumsubAccessToken>(
        'POST',
        `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}` +
          `&levelName=${encodeURIComponent(levelName)}&ttlInSecs=${ttlInSecs}`,
      ),

    fetchApplicantStatus: applicantId =>
      request<SumsubReviewPayload>(
        'GET',
        `/resources/applicants/${encodeURIComponent(applicantId)}/status`,
      ),

    async fetchApplicantByExternalUserId(externalUserId) {
      const applicant = await request<{
        id: string;
        review?: SumsubReviewPayload;
      }>(
        'GET',
        `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`,
      );
      return { applicantId: applicant.id, review: applicant.review ?? {} };
    },
  };
};
