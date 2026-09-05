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

  if ((env.KYC_PROVIDER ?? 'mock') === 'sumsub') {
    // The adapter cannot mint a token or verify a webhook without all three.
    for (const name of ['SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY', 'SUMSUB_WEBHOOK_SECRET']) {
      if (!env[name]) {
        missing.push(`${name} (or set ALLOW_INSECURE_DEV=true for local dev)`);
      }
    }
  }

  if (env.PUBLIC_BASE_URL) {
    try {
      new URL(env.PUBLIC_BASE_URL);
    } catch {
      missing.push(`PUBLIC_BASE_URL must be an absolute URL (got "${env.PUBLIC_BASE_URL}")`);
    }
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

export const PUBLIC_BASE_URL_DEFAULT = 'http://localhost:4000';

/** Base URL this backend is reachable at, without a trailing slash. */
export const getPublicBaseUrl = (env: NodeJS.ProcessEnv = process.env): string =>
  (env.PUBLIC_BASE_URL || PUBLIC_BASE_URL_DEFAULT).replace(/\/+$/, '');

/**
 * Origin of the hosted page, handed to clients as `allowedOrigin` so they can
 * pin postMessage. Falls back to the raw base URL if it is unparseable -
 * validateSecurityConfig refuses to boot in that case anyway.
 */
export const getPublicOrigin = (env: NodeJS.ProcessEnv = process.env): string => {
  const base = getPublicBaseUrl(env);
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
};
