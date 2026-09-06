export const isInsecureDevAllowed = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.ALLOW_INSECURE_DEV === 'true';

export const isJwtRequired = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !isInsecureDevAllowed(env);

export const isWebhookSignatureRequired = (env: NodeJS.ProcessEnv = process.env): boolean =>
  !isInsecureDevAllowed(env);

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

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

  // Fail-closed: the hosted-page URL and the `allowedOrigin` clients pin
  // postMessage to are both derived from this, so an unset value must not
  // silently fall back to localhost outside insecure dev.
  if (!env.PUBLIC_BASE_URL) {
    missing.push('PUBLIC_BASE_URL (or set ALLOW_INSECURE_DEV=true for local dev)');
  } else if (!isHttpUrl(env.PUBLIC_BASE_URL)) {
    missing.push(`PUBLIC_BASE_URL must be an absolute http(s) URL (got "${env.PUBLIC_BASE_URL}")`);
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

/**
 * Base URL this backend is reachable at, without a trailing slash. The
 * localhost default applies to insecure dev ONLY - anywhere else
 * validateSecurityConfig has already refused to boot without an explicit
 * value, so there is nothing to guess.
 */
export const getPublicBaseUrl = (env: NodeJS.ProcessEnv = process.env): string =>
  (env.PUBLIC_BASE_URL || (isInsecureDevAllowed(env) ? PUBLIC_BASE_URL_DEFAULT : '')).replace(
    /\/+$/,
    ''
  );

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
