// Webhook signature primitives shared by every provider adapter.
//
// Derived from esign's validateHmac (apps/api/src/webhook.ts) with two
// changes: the digest is hex rather than base64 (Sumsub's X-Payload-Digest),
// and the hash algorithm is chosen per request from an allow-list, because
// Sumsub names it in X-Payload-Digest-Alg.

import crypto from 'crypto';

import { isWebhookSignatureRequired } from './config';

/** The only digest algorithms we accept, keyed by Sumsub's header value. */
export const DIGEST_ALGORITHMS = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
} as const;

export type HexDigestAlgorithm = keyof typeof DIGEST_ALGORITHMS;

export const DEFAULT_DIGEST_ALGORITHM: HexDigestAlgorithm = 'HMAC_SHA256_HEX';

const logSecurityEvent = (message: string, ip?: string): void => {
  console.error(
    'Security event:',
    JSON.stringify({
      event: message,
      timestamp: new Date().toISOString(),
      ...(ip && { ip }),
    })
  );
};

export const hmacHex = (algorithm: string, secret: string, body: string): string =>
  crypto.createHmac(algorithm, secret).update(body, 'utf8').digest('hex');

/** Constant-time comparison that tolerates unequal lengths. */
export const timingSafeEqualString = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
};

export interface VerifyHexDigestArgs {
  signature: string | undefined;
  algorithm?: string;
  body: string;
  secret: string | undefined;
  ip?: string;
}

/**
 * Verify a hex HMAC digest of the RAW request body.
 *
 * Fail-closed: with no secret configured the webhook is rejected unless
 * ALLOW_INSECURE_DEV=true was explicitly set (local dev / E2E).
 */
export const verifyHexDigest = ({
  signature,
  algorithm,
  body,
  secret,
  ip,
}: VerifyHexDigestArgs): boolean => {
  if (!secret) {
    if (isWebhookSignatureRequired()) {
      logSecurityEvent('Webhook signing secret not configured - webhook rejected', ip);
      return false;
    }
    console.warn('⚠️ Webhook signing secret not configured - signature verification disabled');
    return true;
  }

  const algorithmName = (algorithm ?? DEFAULT_DIGEST_ALGORITHM) as HexDigestAlgorithm;
  const hash = DIGEST_ALGORITHMS[algorithmName];
  if (!hash) {
    logSecurityEvent(`Webhook digest algorithm not allowed: ${algorithmName}`, ip);
    return false;
  }

  if (!signature || signature.trim() === '') {
    logSecurityEvent('Webhook received without a signature', ip);
    return false;
  }

  const valid = timingSafeEqualString(signature, hmacHex(hash, secret, body));
  if (!valid) {
    logSecurityEvent('Webhook signature verification failed', ip);
  }
  return valid;
};
