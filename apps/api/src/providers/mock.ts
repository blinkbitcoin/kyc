// Deterministic in-memory provider. It is what every E2E flow (backend,
// Playwright, Maestro) runs against, so it must be self-contained: no
// network, no credentials, and a webhook it can sign for itself.
//
// Mirrors esign's providers/mock.ts, minus the "delegate verification to the
// real provider" trick: Sumsub's digest scheme needs Sumsub's secret, so the
// mock has its own X-Mock-Signature (hex HMAC-SHA256 keyed with
// MOCK_WEBHOOK_SECRET, default "mock").

import { randomUUID } from 'crypto';

import { isInsecureDevAllowed } from '../config';
import { Errors } from '../errors';
import { hmacHex, timingSafeEqualString } from '../signature';
import type {
  CreateSessionOptions,
  ProviderSession,
  ProviderToken,
  TokenSubject,
  VerificationStatus,
  WebhookEvent,
  WebhookHeaders,
} from '../types';
import { isVerificationStatus } from '../types';
import type { VerificationProvider } from './port';

export const MOCK_APPLICANT_PREFIX = 'mock-applicant-';
export const MOCK_TOKEN_PREFIX = 'mock-token-';
export const MOCK_TOKEN_TTL_SECS = 600;

interface MockApplicant {
  status: VerificationStatus;
  userId: string;
  levelName?: string;
}

const applicants = new Map<string, MockApplicant>();

/**
 * The mock provider signs its own webhooks with a key that defaults to
 * "mock", so anyone who can reach the webhook route can forge an `approved`
 * event. That is fine for dev and E2E and unacceptable anywhere else, so
 * selecting it is an explicit insecure-dev opt-in, checked at boot.
 */
export const assertMockProviderAllowed = (env: NodeJS.ProcessEnv = process.env): void => {
  if (!isInsecureDevAllowed(env)) {
    throw new Error(
      'Refusing to start: KYC_PROVIDER=mock signs its own webhooks and is forgeable. ' +
        'Set ALLOW_INSECURE_DEV=true for local dev, or configure a real provider.'
    );
  }
};

export const getMockWebhookSecret = (env: NodeJS.ProcessEnv = process.env): string =>
  env.MOCK_WEBHOOK_SECRET || 'mock';

export const signMockWebhook = (body: string): string =>
  hmacHex('sha256', getMockWebhookSecret(), body);

const mintToken = (): ProviderToken => ({
  accessToken: `${MOCK_TOKEN_PREFIX}${randomUUID()}`,
  expiresAt: new Date(Date.now() + MOCK_TOKEN_TTL_SECS * 1000).toISOString(),
});

export const MockProvider: VerificationProvider = {
  async createSession(userId: string, opts: CreateSessionOptions): Promise<ProviderSession> {
    const providerApplicantId = `${MOCK_APPLICANT_PREFIX}${randomUUID()}`;
    applicants.set(providerApplicantId, {
      status: 'initial',
      userId,
      levelName: opts.levelName,
    });
    return { providerApplicantId, ...mintToken() };
  },

  async refreshToken(_subject: TokenSubject, _opts: CreateSessionOptions): Promise<ProviderToken> {
    return mintToken();
  },

  async getStatus(providerApplicantId: string): Promise<VerificationStatus> {
    const applicant = applicants.get(providerApplicantId);
    if (!applicant) {
      throw Errors.sessionNotFound();
    }
    return applicant.status;
  },

  verifyWebhook(headers: WebhookHeaders, rawBody: string, ip?: string): boolean {
    const header = headers['x-mock-signature'];
    const signature = typeof header === 'string' ? header : undefined;
    if (!signature) {
      console.error(
        'Security event:',
        JSON.stringify({
          event: 'Mock webhook received without a signature',
          timestamp: new Date().toISOString(),
          ...(ip && { ip }),
        })
      );
      return false;
    }
    const valid = timingSafeEqualString(signature, signMockWebhook(rawBody));
    if (!valid) {
      console.error(
        'Security event:',
        JSON.stringify({
          event: 'Mock webhook signature verification failed',
          timestamp: new Date().toISOString(),
          ...(ip && { ip }),
        })
      );
    }
    return valid;
  },

  parseWebhookEvent(rawBody: string): WebhookEvent | null {
    let payload: { applicantId?: unknown; status?: unknown; externalUserId?: unknown };
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      payload = parsed as typeof payload;
    } catch {
      return null;
    }

    if (typeof payload.applicantId !== 'string' || payload.applicantId === '') {
      return null;
    }

    const status = isVerificationStatus(payload.status) ? payload.status : null;
    if (status) {
      const applicant = applicants.get(payload.applicantId);
      if (applicant) {
        applicant.status = status;
      }
    }

    return {
      providerApplicantId: payload.applicantId,
      externalUserId:
        typeof payload.externalUserId === 'string' ? payload.externalUserId : undefined,
      status,
      rawStatus: String(payload.status),
    };
  },
};

// --- test / E2E helpers (not part of the port) ---

export const setApplicantStatus = (
  providerApplicantId: string,
  status: VerificationStatus
): void => {
  const applicant = applicants.get(providerApplicantId);
  if (applicant) {
    applicant.status = status;
  }
};

export const addApplicant = (
  providerApplicantId: string,
  options: { status?: VerificationStatus; userId?: string; levelName?: string } = {}
): void => {
  applicants.set(providerApplicantId, {
    status: options.status ?? 'initial',
    userId: options.userId ?? 'test-user',
    levelName: options.levelName,
  });
};

export const clearApplicants = (): void => {
  applicants.clear();
};
