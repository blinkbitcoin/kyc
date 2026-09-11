// Deterministic in-memory provider. It is what every E2E flow (backend,
// Playwright, Maestro) runs against, so it must be self-contained: no
// network, no credentials, and a webhook it can sign for itself
// (X-Mock-Signature, hex HMAC-SHA256 keyed with a host-provided secret that
// defaults to "mock"). Because that makes an approved event forgeable by
// anyone who can reach the webhook route, a host must only select it in
// insecure dev - that policy is the host's (the reference backend checks it
// at boot).

import { randomUUID } from 'node:crypto';
import { Errors } from '../../errors';
import { consoleLogger, type Logger } from '../../log';
import type { HostedPageParams } from '../../pages';
import type { HostedPageRenderer, VerificationProvider } from '../../provider';
import { hmacHex, timingSafeEqualString } from '../../signature';
import type {
  CreateSessionOptions,
  ProviderSession,
  ProviderToken,
  TokenSubject,
  VerificationStatus,
  WebhookEvent,
  WebhookHeaders,
} from '../../types';
import { isVerificationStatus } from '../../types';
import { renderMockPage } from './page';

export const MOCK_APPLICANT_PREFIX = 'mock-applicant-';
export const MOCK_TOKEN_PREFIX = 'mock-token-';
export const MOCK_TOKEN_TTL_SECS = 600;
export const MOCK_WEBHOOK_SECRET_DEFAULT = 'mock';
export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

interface MockApplicant {
  status: VerificationStatus;
  userId: string;
  levelName?: string;
}

export interface MockProviderOptions {
  /** Where the page posts its webhooks (read per render: the port may only be known at runtime). */
  publicBaseUrl: () => string;
  /** The signing secret of the mock's own webhooks (default "mock"). */
  webhookSecret?: () => string;
  logger?: Logger;
  newId?: () => string;
  now?: () => Date;
}

export interface MockProviderHandle extends VerificationProvider {
  /** The X-Mock-Signature for a raw webhook body. */
  signWebhook(body: string): string;
  hostedPage: HostedPageRenderer;
  // Test / E2E helpers (not part of the port)
  setApplicantStatus(
    providerApplicantId: string,
    status: VerificationStatus,
  ): void;
  addApplicant(
    providerApplicantId: string,
    options?: {
      status?: VerificationStatus;
      userId?: string;
      levelName?: string;
    },
  ): void;
  clearApplicants(): void;
}

export const createMockProvider = (
  options: MockProviderOptions,
): MockProviderHandle => {
  const logger = options.logger ?? consoleLogger;
  const newId = options.newId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const secret = options.webhookSecret ?? (() => MOCK_WEBHOOK_SECRET_DEFAULT);
  const applicants = new Map<string, MockApplicant>();

  const logSecurityEvent = (event: string, ip?: string): void => {
    logger.error(
      'Security event:',
      JSON.stringify({
        event,
        timestamp: now().toISOString(),
        ...(ip && { ip }),
      }),
    );
  };

  const signWebhook = (body: string): string =>
    hmacHex('sha256', secret(), body);

  const mintToken = (): ProviderToken => ({
    accessToken: `${MOCK_TOKEN_PREFIX}${newId()}`,
    expiresAt: new Date(
      now().getTime() + MOCK_TOKEN_TTL_SECS * 1000,
    ).toISOString(),
  });

  // The page's approve/decline buttons post these back, signed, so the flow
  // runs through the real webhook path
  const hostedPage: HostedPageRenderer = {
    render(params: HostedPageParams): string {
      const url = `${options.publicBaseUrl()}/webhook/kyc/mock`;
      const body = (status: VerificationStatus): string =>
        JSON.stringify({
          applicantId: params.applicantId ?? null,
          externalUserId: params.userId,
          status,
        });
      const post = (status: VerificationStatus) => ({
        url,
        body: body(status),
        signature: signWebhook(body(status)),
      });
      return renderMockPage({
        sessionId: params.sessionId,
        applicantId: params.applicantId,
        nonce: params.nonce,
        webhooks: { approve: post('approved'), decline: post('declined') },
      });
    },
  };

  return {
    async createSession(
      userId: string,
      opts: CreateSessionOptions,
    ): Promise<ProviderSession> {
      const providerApplicantId = `${MOCK_APPLICANT_PREFIX}${newId()}`;
      applicants.set(providerApplicantId, {
        status: 'initial',
        userId,
        levelName: opts.levelName,
      });
      return { providerApplicantId, ...mintToken() };
    },

    async refreshToken(
      _subject: TokenSubject,
      _opts: CreateSessionOptions,
    ): Promise<ProviderToken> {
      return mintToken();
    },

    async getStatus(providerApplicantId: string): Promise<VerificationStatus> {
      const applicant = applicants.get(providerApplicantId);
      if (!applicant) {
        throw Errors.sessionNotFound();
      }
      return applicant.status;
    },

    verifyWebhook(
      headers: WebhookHeaders,
      rawBody: string,
      ip?: string,
    ): boolean {
      const header = headers[MOCK_SIGNATURE_HEADER];
      const signature = typeof header === 'string' ? header : undefined;
      if (!signature) {
        logSecurityEvent('Mock webhook received without a signature', ip);
        return false;
      }
      const valid = timingSafeEqualString(signature, signWebhook(rawBody));
      if (!valid) {
        logSecurityEvent('Mock webhook signature verification failed', ip);
      }
      return valid;
    },

    parseWebhookEvent(rawBody: string): WebhookEvent | null {
      let payload: {
        applicantId?: unknown;
        status?: unknown;
        externalUserId?: unknown;
      };
      try {
        const parsed: unknown = JSON.parse(rawBody);
        if (!parsed || typeof parsed !== 'object') {
          return null;
        }
        payload = parsed as typeof payload;
      } catch {
        return null;
      }

      if (
        typeof payload.applicantId !== 'string' ||
        payload.applicantId === ''
      ) {
        return null;
      }

      const status = isVerificationStatus(payload.status)
        ? payload.status
        : null;
      if (status) {
        const applicant = applicants.get(payload.applicantId);
        if (applicant) {
          applicant.status = status;
        }
      }

      return {
        providerApplicantId: payload.applicantId,
        externalUserId:
          typeof payload.externalUserId === 'string'
            ? payload.externalUserId
            : undefined,
        status,
        rawStatus: String(payload.status),
      };
    },

    hostedPage,
    signWebhook,

    setApplicantStatus(providerApplicantId, status) {
      const applicant = applicants.get(providerApplicantId);
      if (applicant) {
        applicant.status = status;
      }
    },

    addApplicant(providerApplicantId, overrides = {}) {
      applicants.set(providerApplicantId, {
        status: overrides.status ?? 'initial',
        userId: overrides.userId ?? 'test-user',
        levelName: overrides.levelName,
      });
    },

    clearApplicants() {
      applicants.clear();
    },
  };
};
