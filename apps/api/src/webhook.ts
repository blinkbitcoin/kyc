// Webhook application: the ONE place a provider event changes a session's
// status. Structure follows esign's apps/api/src/webhook.ts (span with an
// outcome attribute, resolve the session, apply the event), with two
// KYC-specific additions:
//
//  * binding - a Sumsub session is created before an applicant exists, so
//    the first webhook is matched on externalUserId and binds the applicant
//    id to the user's newest UNBOUND session with that provider;
//  * a rejected event is audited (webhook_rejected) rather than only
//    logged, because refusing to un-approve someone is a compliance event.
//
// This handler never decides whether a transition is allowed: it hands the
// event to session.ts's applyStatusTransition, where the terminal guard is
// part of the UPDATE and the audit row shares the transaction. A concurrent
// delivery therefore cannot race past the guard.

import { sanitizeForLog } from './log';
import type { StatusTransitionOutcome } from './session';
import {
  applyStatusTransition,
  getLatestSessionForUser,
  getSessionByProviderApplicantId,
} from './session';
import { withSpan } from './tracing';
import type { WebhookEvent } from './types';

export type WebhookOutcome = 'ignored_unknown_status' | 'unknown_session' | StatusTransitionOutcome;

export const handleWebhookEvent = async (
  event: WebhookEvent,
  providerName: string
): Promise<WebhookOutcome> =>
  withSpan(
    'kyc.webhook.process',
    { 'kyc.provider': providerName, 'kyc.webhook.raw_status': event.rawStatus },
    async (span): Promise<WebhookOutcome> => {
      const finish = (outcome: WebhookOutcome): WebhookOutcome => {
        span.setAttribute('kyc.webhook.outcome', outcome);
        return outcome;
      };

      if (!event.status) {
        // Not an event we act on: acknowledge so the provider stops retrying.
        console.warn(`Webhook ignored, no actionable status: ${sanitizeForLog(event.rawStatus)}`);
        return finish('ignored_unknown_status');
      }
      const newStatus = event.status;
      span.setAttribute('kyc.status', newStatus);

      let session = await getSessionByProviderApplicantId(event.providerApplicantId);
      let needsBinding = false;

      if (!session && event.externalUserId) {
        // First event of a session created before the provider had an applicant.
        session = await getLatestSessionForUser(event.externalUserId, providerName);
        needsBinding = session !== null;
      }

      if (!session) {
        console.warn('Webhook received for an unknown verification session');
        return finish('unknown_session');
      }
      span.setAttribute('kyc.session_id', session.id);

      const { outcome } = await applyStatusTransition(session.id, newStatus, 'webhook', {
        ...(needsBinding && { bindApplicantId: event.providerApplicantId }),
      });

      if (outcome === 'updated') {
        console.log(`Webhook processed: session ${session.id} status updated to ${newStatus}`);
      } else if (outcome === 'rejected_terminal') {
        console.warn(`Webhook ignored: session ${session.id} is terminal, refusing ${newStatus}`);
      } else if (outcome === 'rejected_unbound') {
        console.warn(
          `Webhook ignored: session ${session.id} belongs to a different provider applicant`
        );
      }

      return finish(outcome);
    }
  );
