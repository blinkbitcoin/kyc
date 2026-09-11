// Webhook signature primitives shared by every provider adapter: a hex HMAC
// over the RAW request body, the hash algorithm chosen per request from an
// allow-list (Sumsub names it in X-Payload-Digest-Alg), and the
// secret-missing policy: without a secret the webhook is rejected (fail
// closed) unless the host explicitly allows unsigned webhooks (local dev
// against the mock provider).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { consoleLogger, type Logger } from './log';

/** The only digest algorithms we accept, keyed by Sumsub's header value. */
export const DIGEST_ALGORITHMS = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
} as const;

export type HexDigestAlgorithm = keyof typeof DIGEST_ALGORITHMS;

export const DEFAULT_DIGEST_ALGORITHM: HexDigestAlgorithm = 'HMAC_SHA256_HEX';

// Log a security event with timestamp and optional IP (no PII)
const logSecurityEvent = (
  logger: Logger,
  message: string,
  ip?: string,
): void => {
  logger.error(
    'Security event:',
    JSON.stringify({
      event: message,
      timestamp: new Date().toISOString(),
      ...(ip && { ip }),
    }),
  );
};

export const hmacHex = (
  algorithm: string,
  secret: string,
  body: string,
): string => createHmac(algorithm, secret).update(body, 'utf8').digest('hex');

/** Constant-time comparison that tolerates unequal lengths. */
export const timingSafeEqualString = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
};

export interface VerifyHexDigestArgs {
  signature: string | undefined;
  algorithm?: string;
  body: string;
  secret: string | undefined;
  // Accept (with a warning) when no secret is configured; default false
  allowMissingSecret?: boolean;
  // Client IP for security logging
  ip?: string;
  logger?: Logger;
}

/**
 * Verify a hex HMAC digest of the RAW request body. Fail-closed: with no
 * secret configured the webhook is rejected unless `allowMissingSecret`.
 */
export const verifyHexDigest = ({
  signature,
  algorithm,
  body,
  secret,
  allowMissingSecret = false,
  ip,
  logger = consoleLogger,
}: VerifyHexDigestArgs): boolean => {
  if (!secret) {
    if (!allowMissingSecret) {
      logSecurityEvent(
        logger,
        'Webhook signing secret not configured - webhook rejected',
        ip,
      );
      return false;
    }
    logger.warn(
      '⚠️ Webhook signing secret not configured - signature verification disabled',
    );
    return true;
  }

  // Object.hasOwn, not a truthiness check on the lookup: a plain object
  // inherits `constructor`, `toString` and friends from Object.prototype, so
  // `DIGEST_ALGORITHMS['constructor']` is a function and would have passed
  // the allow-list.
  const algorithmName = algorithm ?? DEFAULT_DIGEST_ALGORITHM;
  if (!Object.hasOwn(DIGEST_ALGORITHMS, algorithmName)) {
    logSecurityEvent(
      logger,
      `Webhook digest algorithm not allowed: ${algorithmName}`,
      ip,
    );
    return false;
  }
  const hash = DIGEST_ALGORITHMS[algorithmName as HexDigestAlgorithm];

  if (!signature || signature.trim() === '') {
    logSecurityEvent(logger, 'Webhook received without a signature', ip);
    return false;
  }

  const valid = timingSafeEqualString(signature, hmacHex(hash, secret, body));
  if (!valid) {
    logSecurityEvent(logger, 'Webhook signature verification failed', ip);
  }
  return valid;
};
