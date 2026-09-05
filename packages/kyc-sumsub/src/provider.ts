import type { VerificationSession } from '@blinkbitcoin/kyc-core/hosted';

export const SUMSUB_PROVIDER = 'sumsub' as const;

/** Build a VerificationSession that is always tagged as Sumsub. */
export const sumsubSession = (
  fields: Omit<VerificationSession, 'provider'>,
): VerificationSession => ({ ...fields, provider: SUMSUB_PROVIDER });
