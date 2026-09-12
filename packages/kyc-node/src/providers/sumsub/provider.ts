// The Sumsub adapter over the VerificationProvider port. Sumsub mints access
// tokens per EXTERNAL user id, so a session is "created" by minting a token;
// the provider's applicant id is unknown until the applicant loads the SDK
// (bridge event) or the first webhook arrives, which is why createSession
// returns no providerApplicantId and getStatusByUserId exists as a
// capability.

import type { SumsubWebhookPayload } from '@blinkbitcoin/kyc-core/sumsub';
import {
  mapSumsubStatus,
  mapSumsubWebhookStatus,
} from '@blinkbitcoin/kyc-core/sumsub';
import { Errors } from '../../errors';
import { isClientError, isNotFoundError, withRetry } from '../../http';
import type { Logger } from '../../log';
import type { HostedPageRenderer, VerificationProvider } from '../../provider';
import { verifyHexDigest } from '../../signature';
import type {
  CreateSessionOptions,
  FetchLike,
  ProviderSession,
  UserStatusLookup,
  ProviderToken,
  TokenSubject,
  VerificationStatus,
  WebhookEvent,
  WebhookHeaders,
} from '../../types';
import { createSumsubClient, type SumsubClient } from './client';
import type { SumsubConfig } from './config';
import { sumsubHostedPage } from './page';

export const SUMSUB_DIGEST_HEADER = 'x-payload-digest';
export const SUMSUB_DIGEST_ALG_HEADER = 'x-payload-digest-alg';

export interface SumsubWebhookOptions {
  // Accept unsigned webhooks when no secret is configured (local dev only)
  allowMissingSecret?: () => boolean;
  logger?: Logger;
}

export interface SumsubProviderOptions {
  // The configuration, or a getter read per call (credentials may load late)
  config: SumsubConfig | (() => SumsubConfig);
  webhook?: SumsubWebhookOptions;
  fetch?: FetchLike;
  logger?: Logger;
  // The REST client, injectable for tests; built from config + fetch by default
  client?: SumsubClient;
  now?: () => Date;
}

export interface SumsubProviderHandle extends VerificationProvider {
  getStatusByUserId(userId: string): Promise<UserStatusLookup>;
  hostedPage: HostedPageRenderer;
}

// A truly missing header returns undefined so verifyHexDigest can apply its
// default algorithm; an array-valued header (more than one instance of the
// same header - never legitimate here) is stringified into a value that
// cannot match any real signature or algorithm name, so it fails closed
// instead of silently collapsing to "missing" and falling back to defaults.
const headerValue = (
  headers: WebhookHeaders,
  name: string,
): string | undefined => {
  const value = headers[name];
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? JSON.stringify(value) : value;
};

/** The strings of a provider list, or nothing when it is absent, empty or not a list of strings. */
const stringList = (value: unknown): string[] | undefined =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(item => typeof item === 'string')
    ? (value as string[])
    : undefined;

export const createSumsubProvider = (
  options: SumsubProviderOptions,
): SumsubProviderHandle => {
  const resolveConfig =
    typeof options.config === 'function'
      ? options.config
      : () => options.config as SumsubConfig;
  const client =
    options.client ??
    createSumsubClient(resolveConfig, {
      fetch: options.fetch,
      logger: options.logger,
    });
  const now = options.now ?? (() => new Date());

  const mintToken = async (
    userId: string,
    opts: CreateSessionOptions,
  ): Promise<ProviderToken> => {
    const config = resolveConfig();
    try {
      const { token } = await withRetry(() =>
        client.createAccessToken(
          userId,
          opts.levelName || config.levelName,
          config.tokenTtlSecs,
        ),
      );
      return {
        accessToken: token,
        expiresAt: new Date(
          now().getTime() + config.tokenTtlSecs * 1000,
        ).toISOString(),
      };
    } catch (error) {
      throw isClientError(error)
        ? Errors.sessionCreationFailed()
        : Errors.providerUnavailable();
    }
  };

  return {
    createSession: (
      userId: string,
      opts: CreateSessionOptions,
    ): Promise<ProviderSession> => mintToken(userId, opts),

    refreshToken: (
      subject: TokenSubject,
      opts: CreateSessionOptions,
    ): Promise<ProviderToken> => mintToken(subject.userId, opts),

    async getStatus(providerApplicantId: string): Promise<VerificationStatus> {
      try {
        const review = await withRetry(() =>
          client.fetchApplicantStatus(providerApplicantId),
        );
        return mapSumsubStatus(review.reviewStatus, review.reviewResult);
      } catch (error) {
        if (isNotFoundError(error)) {
          throw Errors.sessionNotFound();
        }
        // Any other 4xx is Sumsub telling us the request was wrong (a
        // malformed applicant id, a rejected app token) - reporting that as
        // PROVIDER_UNAVAILABLE would invite a pointless client retry.
        throw isClientError(error)
          ? Errors.validationError('Provider rejected the applicant lookup')
          : Errors.providerUnavailable();
      }
    },

    async getStatusByUserId(userId: string): Promise<UserStatusLookup> {
      try {
        const applicant = await withRetry(() =>
          client.fetchApplicantByExternalUserId(userId),
        );
        return {
          status: mapSumsubStatus(
            applicant.review.reviewStatus,
            applicant.review.reviewResult,
          ),
          providerApplicantId: applicant.applicantId,
        };
      } catch (error) {
        // No applicant yet is the normal state right after a session starts.
        if (isNotFoundError(error)) {
          return { status: 'initial' };
        }
        throw Errors.providerUnavailable();
      }
    },

    verifyWebhook(
      headers: WebhookHeaders,
      rawBody: string,
      ip?: string,
    ): boolean {
      return verifyHexDigest({
        signature: headerValue(headers, SUMSUB_DIGEST_HEADER),
        algorithm: headerValue(headers, SUMSUB_DIGEST_ALG_HEADER),
        body: rawBody,
        secret: resolveConfig().webhookSecret,
        allowMissingSecret: options.webhook?.allowMissingSecret?.() ?? false,
        ip,
        logger: options.webhook?.logger ?? options.logger,
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

      const rejectLabels = stringList(payload.reviewResult?.rejectLabels);
      return {
        providerApplicantId: payload.applicantId,
        externalUserId: payload.externalUserId,
        status: mapSumsubWebhookStatus(payload),
        rawStatus: `${payload.type}:${payload.reviewStatus ?? ''}`,
        ...(typeof payload.levelName === 'string' && payload.levelName
          ? { levelName: payload.levelName }
          : {}),
        ...(rejectLabels ? { rejectLabels } : {}),
      };
    },

    hostedPage: sumsubHostedPage,
  };
};
