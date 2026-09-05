// Sumsub adapter. Sumsub mints access tokens per EXTERNAL user id, so a
// session is "created" by minting a token; the provider's applicant id is
// unknown until the applicant loads the SDK (bridge event) or the first
// webhook arrives, which is why createSession returns no
// providerApplicantId and getStatusByUserId exists as a capability.

import { Errors } from '../../errors';
import { verifyHexDigest } from '../../signature';
import type {
  CreateSessionOptions,
  ProviderSession,
  ProviderToken,
  TokenSubject,
  VerificationStatus,
  WebhookEvent,
  WebhookHeaders,
} from '../../types';
import type { VerificationProvider } from '../port';
import {
  createAccessToken,
  fetchApplicantByExternalUserId,
  fetchApplicantStatus,
  isClientError,
  isNotFoundError,
  withRetry,
} from './client';
import { getConfig } from './config';
import type { SumsubWebhookPayload } from './mapping';
// PHASE 4: import mapSumsubStatus / mapSumsubWebhookStatus from
// '@blinkbitcoin/kyc-sumsub' instead, and delete ./mapping.ts.
import { mapSumsubStatus, mapSumsubWebhookStatus } from './mapping';

// A truly missing header returns undefined so verifyHexDigest can apply its
// default algorithm; an array-valued header (more than one instance of the
// same header - never legitimate here) is stringified into a value that
// cannot match any real signature or algorithm name, so it fails closed
// instead of silently collapsing to "missing" and falling back to defaults.
const headerValue = (headers: WebhookHeaders, name: string): string | undefined => {
  const value = headers[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? JSON.stringify(value) : value;
};

const mintToken = async (userId: string, opts: CreateSessionOptions): Promise<ProviderToken> => {
  const config = getConfig();
  try {
    const { token } = await withRetry(() =>
      createAccessToken(userId, opts.levelName || config.levelName, config.tokenTtlSecs)
    );
    return {
      accessToken: token,
      expiresAt: new Date(Date.now() + config.tokenTtlSecs * 1000).toISOString(),
    };
  } catch (error) {
    throw isClientError(error) ? Errors.sessionCreationFailed() : Errors.providerUnavailable();
  }
};

export const SumsubProvider: VerificationProvider = {
  async createSession(userId: string, opts: CreateSessionOptions): Promise<ProviderSession> {
    return mintToken(userId, opts);
  },

  async refreshToken(subject: TokenSubject, opts: CreateSessionOptions): Promise<ProviderToken> {
    return mintToken(subject.userId, opts);
  },

  async getStatus(providerApplicantId: string): Promise<VerificationStatus> {
    try {
      const review = await withRetry(() => fetchApplicantStatus(providerApplicantId));
      return mapSumsubStatus(review.reviewStatus, review.reviewResult);
    } catch (error) {
      throw isNotFoundError(error) ? Errors.sessionNotFound() : Errors.providerUnavailable();
    }
  },

  async getStatusByUserId(userId: string): Promise<VerificationStatus> {
    try {
      const applicant = await withRetry(() => fetchApplicantByExternalUserId(userId));
      return mapSumsubStatus(applicant.review.reviewStatus, applicant.review.reviewResult);
    } catch (error) {
      // No applicant yet is the normal state right after a session starts.
      if (isNotFoundError(error)) {
        return 'initial';
      }
      throw Errors.providerUnavailable();
    }
  },

  verifyWebhook(headers: WebhookHeaders, rawBody: string, ip?: string): boolean {
    return verifyHexDigest({
      signature: headerValue(headers, 'x-payload-digest'),
      algorithm: headerValue(headers, 'x-payload-digest-alg'),
      body: rawBody,
      secret: getConfig().webhookSecret,
      ip,
    });
  },

  parseWebhookEvent(rawBody: string): WebhookEvent | null {
    let payload: SumsubWebhookPayload;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      payload = parsed as SumsubWebhookPayload;
    } catch {
      return null;
    }

    if (!payload.type || !payload.applicantId) {
      return null;
    }

    return {
      providerApplicantId: payload.applicantId,
      externalUserId: payload.externalUserId,
      status: mapSumsubWebhookStatus(payload),
      rawStatus: `${payload.type}:${payload.reviewStatus ?? ''}`,
    };
  },
};

export { HttpError, withRetry } from './client';
export { getConfig, validateConfig } from './config';
export type { SumsubWebhookPayload } from './mapping';
