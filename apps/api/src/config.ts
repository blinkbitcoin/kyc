export const isInsecureDevAllowed = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.ALLOW_INSECURE_DEV === 'true';

export const isJwtRequired = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !isInsecureDevAllowed(env);

export const isWebhookSignatureRequired = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !isInsecureDevAllowed(env);

export const validateSecurityConfig = (env: NodeJS.ProcessEnv = process.env): void => {
  if (isInsecureDevAllowed(env)) {
    console.warn(
      '⚠️  ALLOW_INSECURE_DEV=true - JWT and webhook signature verification may be bypassed. NEVER set this in production.'
    );
    return;
  }

  const missing: string[] = [];

  if (!env.JWT_SECRET) {
    missing.push('JWT_SECRET (or set ALLOW_INSECURE_DEV=true for local dev)');
  }

  if ((env.KYC_PROVIDER ?? 'mock') === 'sumsub' && !env.SUMSUB_WEBHOOK_SECRET) {
    missing.push('SUMSUB_WEBHOOK_SECRET (or set ALLOW_INSECURE_DEV=true for local dev)');
  }

  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: missing required security configuration: ${missing.join(', ')}`
    );
  }
};

export const getAllowedOrigins = (env: NodeJS.ProcessEnv = process.env): string[] =>
  (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
