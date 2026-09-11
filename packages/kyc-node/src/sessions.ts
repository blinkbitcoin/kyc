// The verification service: the domain rules around a provider and a store -
// authorization and ownership, input bounds, persist-first session creation
// with an audit trail, token refresh, status reconciliation, and the
// webhook state machine. Framework neutral: a GraphQL or HTTP layer maps its
// inputs onto these calls.
//
// Every status change goes through applyStatusTransition: the optional
// binding, the store's conditional write (the terminal guard is inside it)
// and the matching audit row, in ONE transaction. Nothing else in the
// package writes a status (guard-tested).

import { randomUUID } from 'node:crypto';
import {
  type AuditAction,
  type AuditMetadata,
  sanitizeAuditMetadata,
} from './audit';
import { Errors, getErrorCode } from './errors';
import { consoleLogger, type Logger, sanitizeForLog } from './log';
import type { VerificationProvider } from './provider';
import { supportsUserStatusLookup } from './provider';
import type { SessionRecord, SessionStore, StatusWriteOutcome } from './store';
import { noopTracing, type Tracing } from './tracing';
import type {
  VerificationSessionStartInput,
  VerificationStatus,
  WebhookEvent,
} from './types';
import { TERMINAL_STATUSES } from './types';
import { requireId, validateStartInput } from './validation';

export interface VerificationServiceDeps {
  provider: VerificationProvider;
  /** The name the provider is registered under (audited, returned to clients). */
  providerName: string;
  store: SessionStore;
  /**
   * The base URL this backend is reachable at, without a trailing slash: the
   * hosted page lives under it and clients pin postMessage to its origin.
   */
  publicBaseUrl: () => string;
  tracing?: Tracing;
  logger?: Logger;
  // Id generator (UUIDs by default; injectable for deterministic tests)
  newId?: () => string;
}

/** What a client may see of a session - never the provider's token material. */
export interface SessionView {
  sessionId: string;
  provider: string;
  status: VerificationStatus;
  applicantId: string | null;
}

export interface StartResult extends SessionView {
  accessToken: string;
  /** The hosted verification page for this session. */
  url: string;
  /** The page's origin, for the client's postMessage pin. */
  allowedOrigin: string;
}

export interface RefreshResult {
  accessToken: string;
}

export type StatusTransitionOutcome = StatusWriteOutcome | 'rejected_unbound';

export interface StatusTransition {
  outcome: StatusTransitionOutcome;
  previousStatus: VerificationStatus;
  session: SessionRecord;
}

export interface ApplyStatusTransitionOptions {
  /** Applicant id to bind in the same transaction (first webhook of a session). */
  bindApplicantId?: string;
}

// How a webhook event was handled (also recorded on the span)
export type WebhookOutcome =
  | 'ignored_unknown_status'
  | 'unknown_session'
  | StatusTransitionOutcome;

export type StatusSource = 'api' | 'webhook';

/**
 * What a host serves for GET /hosted/:sessionId. The unguessable session id
 * is the capability: the URL is handed to exactly one client by start(),
 * and the token the page embeds is minted fresh per render (so a stale
 * start-time token can never reach the SDK).
 */
export type HostedPageDecision =
  | { kind: 'page'; session: SessionRecord; accessToken: string }
  | { kind: 'not_found'; status: 404 | 502 };

export interface VerificationService {
  /** Persist a session, mint the first token, return what a source needs. */
  start(
    userId: string | null,
    input: VerificationSessionStartInput,
  ): Promise<StartResult>;
  /** A replacement provider token for a session still in progress. */
  refresh(userId: string | null, sessionId: string): Promise<RefreshResult>;
  /** The session's status, reconciled against the provider when not terminal. */
  status(userId: string | null, id: string): Promise<SessionView>;
  /** Sync a verified, parsed provider event into the stored status. */
  handleWebhookEvent(event: WebhookEvent): Promise<WebhookOutcome>;
  /** The session and a fresh token for its hosted page, or why not. */
  hostedPage(sessionId: string): Promise<HostedPageDecision>;
  /** The shared write path (exposed for hosts that reconcile on their own). */
  applyStatusTransition(
    id: string,
    status: VerificationStatus,
    source: StatusSource,
    options?: ApplyStatusTransitionOptions,
  ): Promise<StatusTransition>;
}

/** The origin of a base URL, or the URL itself when it is not parseable. */
export const publicOrigin = (base: string): string => {
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
};

export const createVerificationService = (
  deps: VerificationServiceDeps,
): VerificationService => {
  const { provider, providerName, store, publicBaseUrl } = deps;
  const tracing = deps.tracing ?? noopTracing;
  const logger = deps.logger ?? consoleLogger;
  const newId = deps.newId ?? randomUUID;

  const requireUser = (userId: string | null): string => {
    if (!userId) {
      throw Errors.unauthorized();
    }
    return userId;
  };

  const requireOwned = async (id: string, userId: string) => {
    const session = await store.getSessionByIdForUser(id, userId);
    if (!session) {
      // Same error whether it is missing or someone else's: no enumeration.
      throw Errors.sessionNotFound();
    }
    tracing.annotate?.({ 'kyc.session_id': session.id });
    return session;
  };

  const audit = (
    target: SessionStore,
    sessionId: string,
    action: AuditAction,
    metadata?: AuditMetadata,
  ) =>
    target.appendAuditEntry({
      id: newId(),
      sessionId,
      action,
      metadata: sanitizeAuditMetadata(metadata),
    });

  const view = (session: SessionRecord): SessionView => ({
    sessionId: session.id,
    provider: session.provider,
    status: session.status,
    applicantId: session.providerApplicantId,
  });

  const applyStatusTransition: VerificationService['applyStatusTransition'] = (
    id,
    status,
    source,
    options = {},
  ) =>
    store.transaction(async tx => {
      if (options.bindApplicantId) {
        const bound = await tx.bindApplicantId(id, options.bindApplicantId);
        if (bound.providerApplicantId !== options.bindApplicantId) {
          await audit(tx, id, 'webhook_rejected', {
            status,
            previousStatus: bound.status,
            source,
            reason: 'applicant_mismatch',
          });
          return {
            outcome: 'rejected_unbound' as const,
            previousStatus: bound.status,
            session: bound,
          };
        }
      }

      const transition = await tx.updateSessionStatus(id, status);

      if (transition.outcome === 'updated') {
        await audit(tx, id, 'status_updated', {
          status,
          previousStatus: transition.previousStatus,
          source,
        });
      } else if (
        transition.outcome === 'rejected_terminal' &&
        source === 'webhook'
      ) {
        // Refusing to un-approve someone is a compliance event, not just a log line.
        await audit(tx, id, 'webhook_rejected', {
          status,
          previousStatus: transition.previousStatus,
          source,
          reason: 'terminal_status',
        });
      }

      return transition;
    });

  return {
    async start(userId, input) {
      const owner = requireUser(userId);
      const { platform, levelName, locale } = validateStartInput(input);

      // Persist first: a session row is what makes a provider failure
      // auditable (the audit entry references the session).
      let session: SessionRecord;
      try {
        session = await store.transaction(async tx => {
          const created = await tx.createSession({
            id: newId(),
            userId: owner,
            provider: providerName,
            platform,
            levelName,
            locale,
          });
          await audit(tx, created.id, 'session_created', {
            userId: owner,
            provider: providerName,
            platform,
            levelName,
          });
          return created;
        });
      } catch (error) {
        logger.error(
          'Failed to persist verification session:',
          error instanceof Error ? error.message : error,
        );
        throw Errors.persistenceFailed();
      }
      tracing.annotate?.({ 'kyc.session_id': session.id });

      let minted;
      try {
        minted = await provider.createSession(owner, {
          platform,
          levelName,
          locale,
        });
      } catch (error) {
        const errorCode = getErrorCode(error) ?? 'UNKNOWN_ERROR';
        logger.error('Verification session creation failed:', {
          action: 'creation_failed',
          errorCode,
          sessionId: session.id,
          timestamp: new Date().toISOString(),
        });
        await audit(store, session.id, 'creation_failed', {
          errorCode,
          source: 'api',
        });
        throw getErrorCode(error) ? error : Errors.providerUnavailable();
      }

      if (minted.providerApplicantId) {
        await store.bindApplicantId(session.id, minted.providerApplicantId);
      }

      const base = publicBaseUrl();
      return {
        ...view(session),
        accessToken: minted.accessToken,
        url: `${base}/hosted/${session.id}`,
        allowedOrigin: publicOrigin(base),
        applicantId: minted.providerApplicantId ?? null,
      };
    },

    async refresh(userId, sessionId) {
      const owner = requireUser(userId);
      const session = await requireOwned(
        requireId(sessionId, 'sessionId'),
        owner,
      );

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
          {
            userId: owner,
            providerApplicantId: session.providerApplicantId ?? undefined,
          },
          {
            platform:
              session.platform as VerificationSessionStartInput['platform'],
            levelName: session.levelName ?? undefined,
          },
        );
      } catch (error) {
        throw getErrorCode(error) ? error : Errors.providerUnavailable();
      }

      await audit(store, session.id, 'token_refreshed', {
        userId: owner,
        source: 'api',
      });
      return { accessToken: token.accessToken };
    },

    async status(userId, id) {
      const owner = requireUser(userId);
      const session = await requireOwned(requireId(id, 'id'), owner);
      let status: VerificationStatus = session.status;

      // Self-heal a non-terminal session against the provider. Once an
      // applicant id is bound we ask about that applicant directly; before
      // that (a Sumsub session mints tokens per external user id, so the
      // applicant does not exist yet) we fall back to the optional user-id
      // lookup. Webhooks remain the source of truth - this only repairs a
      // session whose webhook was lost or is still in flight.
      const lookupProviderStatus =
        async (): Promise<VerificationStatus | null> => {
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
          // Applied through the SAME conditional write the webhook path uses,
          // so a lookup racing an in-flight webhook can never bypass the
          // state machine.
          if (providerStatus) {
            const transition = await applyStatusTransition(
              session.id,
              providerStatus,
              'api',
            );
            status = transition.session.status;
          }
        } catch (error) {
          // Reconciliation is best effort: keep the stored status and answer
          // the client with it rather than failing the query.
          logger.warn(
            'Verification status reconciliation failed:',
            getErrorCode(error) ?? 'UNKNOWN_ERROR',
          );
        }
      }

      return { ...view(session), status };
    },

    handleWebhookEvent(event) {
      return tracing.withSpan(
        'kyc.webhook.process',
        {
          'kyc.provider': providerName,
          'kyc.webhook.raw_status': event.rawStatus,
        },
        async (span): Promise<WebhookOutcome> => {
          const finish = (outcome: WebhookOutcome): WebhookOutcome => {
            span.setAttribute('kyc.webhook.outcome', outcome);
            return outcome;
          };

          if (!event.status) {
            // Not an event we act on: acknowledge so the provider stops retrying.
            logger.warn(
              `Webhook ignored, no actionable status: ${sanitizeForLog(event.rawStatus)}`,
            );
            return finish('ignored_unknown_status');
          }
          const newStatus = event.status;
          span.setAttribute('kyc.status', newStatus);

          let session = await store.getSessionByProviderApplicantId(
            event.providerApplicantId,
          );
          let needsBinding = false;

          if (!session && event.externalUserId) {
            // First event of a session created before the provider had an applicant.
            session = await store.getLatestUnboundSessionForUser(
              event.externalUserId,
              providerName,
            );
            needsBinding = session !== null;
          }

          if (!session) {
            logger.warn('Webhook received for an unknown verification session');
            return finish('unknown_session');
          }
          span.setAttribute('kyc.session_id', session.id);

          const { outcome } = await applyStatusTransition(
            session.id,
            newStatus,
            'webhook',
            needsBinding ? { bindApplicantId: event.providerApplicantId } : {},
          );

          if (outcome === 'updated') {
            logger.log(
              `Webhook processed: session ${session.id} status updated to ${newStatus}`,
            );
          } else if (outcome === 'rejected_terminal') {
            logger.warn(
              `Webhook ignored: session ${session.id} is terminal, refusing ${newStatus}`,
            );
          } else if (outcome === 'rejected_unbound') {
            logger.warn(
              `Webhook ignored: session ${session.id} belongs to a different provider applicant`,
            );
          }

          return finish(outcome);
        },
      );
    },

    async hostedPage(sessionId) {
      const session = await store.getSessionById(sessionId);

      // A finished verification has nothing left to render, and minting a
      // provider token for it would hand out a live SDK session for an
      // applicant whose outcome is already final. A session of another
      // provider is not this deployment's to render.
      // NOTE: there is no max-age on the URL yet - the session id stays
      // usable for as long as the session is non-terminal.
      if (
        !session ||
        session.provider !== providerName ||
        TERMINAL_STATUSES.has(session.status)
      ) {
        return { kind: 'not_found', status: 404 };
      }

      try {
        const token = await provider.refreshToken(
          {
            userId: session.userId,
            providerApplicantId: session.providerApplicantId ?? undefined,
          },
          {
            platform:
              session.platform as VerificationSessionStartInput['platform'],
            levelName: session.levelName ?? undefined,
          },
        );
        return { kind: 'page', session, accessToken: token.accessToken };
      } catch (error) {
        logger.error(
          'Hosted page token minting failed:',
          error instanceof Error ? error.message : error,
        );
        return { kind: 'not_found', status: 502 };
      }
    },

    applyStatusTransition,
  };
};
