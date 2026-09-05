// Webhook application: the ONE place a provider event changes a session's
// status. Structure follows esign's apps/api/src/webhook.ts (span with an
// outcome attribute, idempotency check, terminal guard, one transaction for
// the status update plus its audit row), with two KYC-specific additions:
//
//  * binding - a Sumsub session is created before an applicant exists, so
//    the first webhook is matched on externalUserId and binds the applicant
//    id to the user's newest session with that provider;
//  * a rejected downgrade is audited (webhook_rejected) rather than only
//    logged, because refusing to un-approve someone is a compliance event.

import { logAuditEvent } from './audit';
import { knex } from './db';
import { sanitizeForLog } from './log';
import {
  bindApplicantId,
  canTransition,
  getLatestSessionForUser,
  getSessionByProviderApplicantId,
  updateSessionStatus,
} from './session';
import { withSpan } from './tracing';
import type { WebhookEvent } from './types';

export type WebhookOutcome =
  | 'ignored_unknown_status'
  | 'unknown_session'
  | 'unchanged'
  | 'rejected_terminal'
  | 'updated';

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

      if (session.status === newStatus) {
        if (needsBinding) {
          await bindApplicantId(session.id, event.providerApplicantId);
        }
        return finish('unchanged');
      }

      if (!canTransition(session.status, newStatus)) {
        console.warn(
          `Webhook ignored: session ${session.id} is terminal (${session.status}), refusing ${newStatus}`
        );
        await logAuditEvent(session.id, 'webhook_rejected', {
          status: newStatus,
          previousStatus: session.status,
          source: 'webhook',
          reason: 'terminal_status',
        });
        return finish('rejected_terminal');
      }

      const current = session;
      await knex.transaction(async (trx) => {
        if (needsBinding) {
          await bindApplicantId(current.id, event.providerApplicantId, trx);
        }
        await updateSessionStatus(current.id, newStatus, trx);
        await logAuditEvent(
          current.id,
          'status_updated',
          { status: newStatus, previousStatus: current.status, source: 'webhook' },
          trx
        );
      });

      console.log(`Webhook processed: session ${current.id} status updated to ${newStatus}`);
      return finish('updated');
    }
  );
