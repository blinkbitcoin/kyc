// The Sumsub SANDBOX endpoints the live submission tests drive: what the SDK
// (applicant creation, the document upload, "request check") and the
// dashboard reviewer (the review answer) do for a real user, done from a
// test so an actual verification runs end to end without a camera. All of
// it is test-only: the library never creates applicants, uploads documents
// or decides reviews - a host's users do the first three through the SDK
// and Sumsub does the last. `status/testCompleted` exists only for sandbox
// tokens (a production token is answered "only supported on sandbox env").
//
// Signing is the package's own `signPayload` (X-App-Access-Sig over
// ts + METHOD + path + the exact body bytes), so the multipart upload is
// built as a Buffer with a fixed boundary and signed as sent.

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpError, type SumsubConfig, signPayload } from '@blinkbitcoin/kyc-node';

export type ReviewAnswer =
  | 'GREEN'
  | { red: 'RETRY' | 'FINAL'; labels: readonly string[]; comment?: string };

export interface SandboxApplicant {
  id: string;
  externalUserId: string;
  review: { reviewStatus: string; levelName?: string };
  requiredIdDocs?: { docSets?: Array<{ idDocSetType: string; videoRequired?: string }> };
}

export interface ReviewStatus {
  reviewStatus: string;
  reviewResult?: { reviewAnswer?: string; reviewRejectType?: string; rejectLabels?: string[] };
}

/** Per verification step (IDENTITY, SELFIE, ...): images uploaded, step review. */
export type StepsStatus = Record<
  string,
  { imageIds?: string[]; reviewResult?: { reviewAnswer?: string } } | null
>;

export interface SandboxOptions {
  /** One line per call, `[live] <verb> <applicant> <status> <ms>`; the live tier logs freely. */
  log?: (line: string) => void;
}

const FIXTURES = new URL('./fixtures/sumsub/', import.meta.url);
/** Sumsub's accepted German passport template, byte for byte (fixtures/sumsub/README.md). */
export const GERMANY_PASSPORT = {
  file: readFileSync(fileURLToPath(new URL('germany-passport.jpg', FIXTURES))),
  metadata: { idDocType: 'PASSPORT', country: 'DEU' },
} as const;

/** Sumsub's header value -> node's hash name; the same table verifyHexDigest accepts. */
export const WEBHOOK_DIGEST = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
} as const;
export type WebhookDigestAlg = keyof typeof WEBHOOK_DIGEST;

/** A webhook body signed the way the dashboard signs it (the registered secret + algorithm). */
export const signWebhook = (
  body: string,
  secret: string,
  alg: WebhookDigestAlg
): { digest: string; alg: WebhookDigestAlg } => ({
  digest: createHmac(WEBHOOK_DIGEST[alg], secret).update(body, 'utf8').digest('hex'),
  alg,
});

/** The config with the two API credentials present (assertSumsubConfig checked them). */
export type SandboxConfig = SumsubConfig & { appToken: string; secretKey: string };

export const createSandbox = (config: SandboxConfig, options: SandboxOptions = {}) => {
  const log = options.log ?? (() => {});

  const call = async <T>(
    method: string,
    pathWithQuery: string,
    body?: string | Buffer,
    headers: Record<string, string> = {}
  ): Promise<T> => {
    const ts = Math.floor(Date.now() / 1000);
    const started = Date.now();
    const response = await fetch(`${config.baseUrl}${pathWithQuery}`, {
      method,
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
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    const text = await response.text();
    log(
      `[live] ${method} ${pathWithQuery.replace(/[0-9a-f]{24}/g, '<applicant>')} ${response.status} ${Date.now() - started}ms`
    );
    if (!response.ok) throw new HttpError(response.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  };

  const json = (value: unknown) => ({
    body: JSON.stringify(value),
    headers: { 'Content-Type': 'application/json' },
  });

  const applicant = (id: string) => `/resources/applicants/${encodeURIComponent(id)}`;

  return {
    /** What the SDK does when it opens with an access token for a new user. */
    createApplicant: (externalUserId: string, levelName: string): Promise<SandboxApplicant> => {
      const { body, headers } = json({ externalUserId, type: 'individual' });
      return call(
        'POST',
        `/resources/applicants?levelName=${encodeURIComponent(levelName)}`,
        body,
        headers
      );
    },

    /** The document capture, as a multipart upload of an image plus its metadata. */
    uploadIdDoc: async (
      applicantId: string,
      doc: { file: Buffer; metadata: { idDocType: string; country: string } },
      filename = 'document.jpg'
    ): Promise<{ idDocType?: string; country?: string }> => {
      const boundary = `----kycLive${Date.now().toString(16)}`;
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(doc.metadata)}\r\n`
        ),
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`
        ),
        doc.file,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return call('POST', `${applicant(applicantId)}/info/idDoc`, body, {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-Return-Doc-Warnings': 'true',
      });
    },

    stepsStatus: (applicantId: string): Promise<StepsStatus> =>
      call('GET', `${applicant(applicantId)}/requiredIdDocsStatus`),

    /** The SDK's "submit": the applicant goes to pending once every step has an image. */
    requestCheck: (applicantId: string): Promise<{ ok?: number }> =>
      call('POST', `${applicant(applicantId)}/status/pending`),

    status: (applicantId: string): Promise<ReviewStatus> =>
      call('GET', `${applicant(applicantId)}/status`),

    /** The reviewer's verdict, sandbox only; Sumsub then sends the real applicantReviewed webhook. */
    simulateReview: (applicantId: string, answer: ReviewAnswer): Promise<{ ok?: number }> => {
      const { body, headers } = json(
        answer === 'GREEN'
          ? { reviewAnswer: 'GREEN' }
          : {
              reviewAnswer: 'RED',
              reviewRejectType: answer.red,
              rejectLabels: answer.labels,
              moderationComment: answer.comment ?? 'kyc-library live test',
            }
      );
      return call('POST', `${applicant(applicantId)}/status/testCompleted`, body, headers);
    },

    /** Back to init with the images inactive (the dashboard's "Reset"). */
    resetApplicant: (applicantId: string): Promise<{ ok?: number }> =>
      call('POST', `${applicant(applicantId)}/reset`),
  };
};

export type Sandbox = ReturnType<typeof createSandbox>;

/** Poll `read` until `done` accepts its value; the last value is thrown on timeout. */
export const pollUntil = async <T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  {
    timeoutMs,
    intervalMs = 2000,
    what = 'condition',
  }: { timeoutMs: number; intervalMs?: number; what?: string }
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let last: T = await read();
  while (!done(last)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for ${what}; last: ${JSON.stringify(last)}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    last = await read();
  }
  return last;
};
