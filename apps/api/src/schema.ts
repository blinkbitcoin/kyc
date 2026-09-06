// GraphQL resolvers for the verification-session contract in
// src/typeDefs.ts. Orchestration only: the provider seam does the provider
// work, src/session.ts and src/audit.ts do the persistence, and this file
// owns auth, validation, ownership and error mapping (esign's schema.ts,
// with the KYC operations).

import { logAuditEvent } from './audit';
import { getPublicBaseUrl, getPublicOrigin } from './config';
import { knex } from './db';
import { Errors } from './errors';
import { getProviderName, provider, supportsUserStatusLookup } from './providers';
import {
  applyStatusTransition,
  bindApplicantId,
  createSession,
  getSessionByIdForUser,
} from './session';
import { setActiveSpanAttributes } from './tracing';
import type { GraphQLContext, VerificationSessionStartInput, VerificationStatus } from './types';
import { isVerificationPlatform, TERMINAL_STATUSES } from './types';

export { typeDefs } from './typeDefs';

export const MAX_LEVEL_NAME_LENGTH = 100;
export const MAX_LOCALE_LENGTH = 35; // RFC 5646 language tags stay well under this

/**
 * The locale shapes we accept and hand to a provider SDK: a two-letter
 * language, optionally with a two-letter region ("en", "en-US"). Deliberately
 * narrower than RFC 5646 - it goes into the hosted page's SDK config, so the
 * accepted set is bounded rather than "whatever the client sent".
 */
export const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

const requireUserId = (context: GraphQLContext): string => {
  if (!context.userId) {
    throw Errors.unauthorized();
  }
  return context.userId;
};

const requireId = (value: string | undefined, field: string): string => {
  if (!value || value.trim() === '') {
    throw Errors.validationError(`${field} is required and cannot be empty`);
  }
  return value;
};

const optionalText = (
  value: string | null | undefined,
  field: string,
  maxLength: number
): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value.trim() === '') {
    throw Errors.validationError(`${field} cannot be empty when provided`);
  }
  if (value.length > maxLength) {
    throw Errors.validationError(`${field} must be at most ${maxLength} characters`);
  }
  return value;
};

const errorCodeOf = (error: unknown): string | undefined => {
  if (error && typeof error === 'object' && 'extensions' in error) {
    const code = (error as { extensions?: { code?: unknown } }).extensions?.code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
};

export const resolvers = {
  Query: {
    health: () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),

    verificationSession: async (
      _parent: unknown,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      const userId = requireUserId(context);
      requireId(id, 'id');

      const session = await getSessionByIdForUser(id, userId);
      if (!session) {
        // Same error whether it is missing or someone else's: no enumeration.
        throw Errors.sessionNotFound();
      }
      setActiveSpanAttributes({ 'kyc.session_id': session.id });

      let status: VerificationStatus = session.status;

      // Self-heal a non-terminal session against the provider. Once an
      // applicant id is bound we ask about that applicant directly; before
      // that (a Sumsub session mints tokens per external user id, so the
      // applicant does not exist yet) we fall back to the optional
      // user-id lookup. Webhooks remain the source of truth - this only
      // repairs a session whose webhook was lost or is still in flight.
      const lookupProviderStatus = async (): Promise<VerificationStatus | null> => {
        if (session.providerApplicantId) {
          return provider.getStatus(session.providerApplicantId);
        }
        return supportsUserStatusLookup(provider)
          ? provider.getStatusByUserId(session.userId)
          : null;
      };

      if (!TERMINAL_STATUSES.has(status)) {
        try {
          const providerStatus = await lookupProviderStatus();
          // Applied through the SAME conditional write the webhook path uses:
          // the terminal guard is part of the UPDATE and the audit row shares
          // its transaction, so a lookup racing an in-flight webhook can
          // never bypass the state machine.
          if (providerStatus) {
            const transition = await applyStatusTransition(session.id, providerStatus, 'api');
            status = transition.session.status;
          }
        } catch (error) {
          // Reconciliation is best effort: keep the stored status and answer
          // the client with it rather than failing the query.
          console.warn(
            'Verification status reconciliation failed:',
            errorCodeOf(error) ?? 'UNKNOWN_ERROR'
          );
        }
      }

      return {
        sessionId: session.id,
        provider: session.provider,
        status,
        applicantId: session.providerApplicantId,
      };
    },
  },

  Mutation: {
    verificationSessionStart: async (
      _parent: unknown,
      { input }: { input: VerificationSessionStartInput },
      context: GraphQLContext
    ) => {
      const userId = requireUserId(context);

      if (!isVerificationPlatform(input?.platform)) {
        throw Errors.validationError('platform must be one of WEB, IOS, ANDROID');
      }
      const levelName = optionalText(input.levelName, 'levelName', MAX_LEVEL_NAME_LENGTH);
      const locale = optionalText(input.locale, 'locale', MAX_LOCALE_LENGTH);
      if (locale !== undefined && !LOCALE_PATTERN.test(locale)) {
        throw Errors.validationError('locale must look like "en" or "en-US"');
      }
      const providerName = getProviderName();

      // Persist first: a session row is what makes a provider failure
      // auditable (AuditLog.sessionId is a NOT NULL foreign key).
      let session;
      try {
        session = await knex.transaction(async (trx) => {
          const created = await createSession(
            { userId, provider: providerName, platform: input.platform, levelName, locale },
            trx
          );
          await logAuditEvent(
            created.id,
            'session_created',
            { userId, provider: providerName, platform: input.platform, levelName },
            trx
          );
          return created;
        });
      } catch (error) {
        console.error(
          'Failed to persist verification session:',
          error instanceof Error ? error.message : error
        );
        throw Errors.persistenceFailed();
      }
      setActiveSpanAttributes({ 'kyc.session_id': session.id });

      let providerSession;
      try {
        providerSession = await provider.createSession(userId, {
          platform: input.platform,
          levelName,
          locale,
        });
      } catch (error) {
        const errorCode = errorCodeOf(error) ?? 'UNKNOWN_ERROR';
        console.error('Verification session creation failed:', {
          action: 'creation_failed',
          errorCode,
          sessionId: session.id,
          timestamp: new Date().toISOString(),
        });
        await logAuditEvent(session.id, 'creation_failed', { errorCode, source: 'api' });
        throw errorCodeOf(error) ? error : Errors.providerUnavailable();
      }

      if (providerSession.providerApplicantId) {
        await bindApplicantId(session.id, providerSession.providerApplicantId);
      }

      return {
        sessionId: session.id,
        provider: providerName,
        status: session.status,
        accessToken: providerSession.accessToken,
        url: `${getPublicBaseUrl()}/hosted/${session.id}`,
        allowedOrigin: getPublicOrigin(),
        applicantId: providerSession.providerApplicantId ?? null,
      };
    },

    verificationSessionRefresh: async (
      _parent: unknown,
      { sessionId }: { sessionId: string },
      context: GraphQLContext
    ) => {
      const userId = requireUserId(context);
      requireId(sessionId, 'sessionId');

      const session = await getSessionByIdForUser(sessionId, userId);
      if (!session) {
        throw Errors.sessionNotFound();
      }
      setActiveSpanAttributes({ 'kyc.session_id': session.id });

      // A terminal session is finished: refreshing it would mint a live
      // provider token for an outcome that can no longer change.
      // NOTE: there is no max-age on a session yet - a non-terminal session
      // stays refreshable indefinitely.
      if (TERMINAL_STATUSES.has(session.status)) {
        throw Errors.validationError('session is terminal');
      }

      let token;
      try {
        token = await provider.refreshToken(
          { userId, providerApplicantId: session.providerApplicantId ?? undefined },
          {
            platform: session.platform as VerificationSessionStartInput['platform'],
            levelName: session.levelName ?? undefined,
          }
        );
      } catch (error) {
        throw errorCodeOf(error) ? error : Errors.providerUnavailable();
      }

      await logAuditEvent(session.id, 'token_refreshed', { userId, source: 'api' });

      return { accessToken: token.accessToken };
    },
  },
};
