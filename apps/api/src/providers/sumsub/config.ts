// Sumsub adapter configuration. Mirrors esign's
// apps/api/src/providers/docusign/config.ts: pure env reading plus a
// fail-fast validator the provider factory calls at boot.

export interface SumsubConfig {
  appToken?: string;
  secretKey?: string;
  webhookSecret?: string;
  baseUrl: string;
  levelName: string;
  tokenTtlSecs: number;
}

export const SUMSUB_DEFAULTS = {
  baseUrl: 'https://api.sumsub.com',
  /** Used whenever the GraphQL input omits levelName. */
  levelName: 'basic-kyc-level',
  tokenTtlSecs: 600,
} as const;

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getConfig = (env: NodeJS.ProcessEnv = process.env): SumsubConfig => ({
  appToken: env.SUMSUB_APP_TOKEN,
  secretKey: env.SUMSUB_SECRET_KEY,
  webhookSecret: env.SUMSUB_WEBHOOK_SECRET,
  baseUrl: (env.SUMSUB_BASE_URL || SUMSUB_DEFAULTS.baseUrl).replace(/\/+$/, ''),
  levelName: env.SUMSUB_LEVEL_NAME || SUMSUB_DEFAULTS.levelName,
  tokenTtlSecs: positiveInt(env.SUMSUB_TOKEN_TTL_SECS, SUMSUB_DEFAULTS.tokenTtlSecs),
});

export const validateConfig = (env: NodeJS.ProcessEnv = process.env): void => {
  const config = getConfig(env);
  const missing: string[] = [];

  if (!config.appToken) missing.push('SUMSUB_APP_TOKEN');
  if (!config.secretKey) missing.push('SUMSUB_SECRET_KEY');
  if (!config.webhookSecret) missing.push('SUMSUB_WEBHOOK_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Sumsub provider: Missing required environment variables: ${missing.join(', ')}`
    );
  }
};
