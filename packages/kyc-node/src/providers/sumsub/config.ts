// Sumsub configuration: an explicit object (no hidden process.env reads in
// the client) plus the conventional SUMSUB_* environment mapping and a
// fail-fast check for the credentials a real deployment cannot do without.

export interface SumsubConfig {
  appToken?: string;
  secretKey?: string;
  webhookSecret?: string;
  baseUrl: string;
  /** Used whenever the session input omits levelName. */
  levelName: string;
  tokenTtlSecs: number;
  /** Ceiling on a single Sumsub HTTP call, retries excluded. */
  requestTimeoutMs: number;
}

export type SumsubConfigKey = keyof SumsubConfig;

// The environment variable behind each setting
export const SUMSUB_ENV: Record<SumsubConfigKey, string> = {
  appToken: 'SUMSUB_APP_TOKEN',
  secretKey: 'SUMSUB_SECRET_KEY',
  webhookSecret: 'SUMSUB_WEBHOOK_SECRET',
  baseUrl: 'SUMSUB_BASE_URL',
  levelName: 'SUMSUB_LEVEL_NAME',
  tokenTtlSecs: 'SUMSUB_TOKEN_TTL_SECS',
  requestTimeoutMs: 'SUMSUB_REQUEST_TIMEOUT_MS',
};

export const SUMSUB_DEFAULTS = {
  baseUrl: 'https://api.sumsub.com',
  levelName: 'basic-kyc-level',
  tokenTtlSecs: 600,
  requestTimeoutMs: 10000,
} as const;

/** What the adapter cannot mint a token or verify a webhook without. */
export const SUMSUB_CREDENTIALS: readonly SumsubConfigKey[] = [
  'appToken',
  'secretKey',
  'webhookSecret',
];

/** What minting an access token cannot do without (no webhook secret: a
 * host that receives no webhooks never needs one). */
export const ACCESS_TOKEN_SETTINGS: readonly SumsubConfigKey[] = [
  'appToken',
  'secretKey',
];

export type Env = Record<string, string | undefined>;

// The prefix Sumsub gives every sandbox app token; production tokens have
// none. Same host either way, so the token is the one tell.
export const SUMSUB_SANDBOX_TOKEN_PREFIX = 'sbx:';

// A sandbox app token (undefined and empty are not sandbox: they are missing)
export const isSumsubSandboxToken = (appToken: string | undefined): boolean =>
  typeof appToken === 'string' &&
  appToken.startsWith(SUMSUB_SANDBOX_TOKEN_PREFIX);

// The demo settings `config` still uses, as "VAR=value" for the production
// guard - the token reduced to its prefix, so no secret reaches a log
export const sumsubDemoSettingsInUse = (config: SumsubConfig): string[] =>
  isSumsubSandboxToken(config.appToken)
    ? [`${SUMSUB_ENV.appToken}=${SUMSUB_SANDBOX_TOKEN_PREFIX}…`]
    : [];

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// A loop, not `/\/+$/`: CodeQL's js/polynomial-redos flags that regex on
// input the code does not control (the URL comes from the environment).
const stripTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
};

// Read the SUMSUB_* variables (defaults for everything but the credentials)
export const sumsubConfigFromEnv = (env: Env = process.env): SumsubConfig => ({
  appToken: env[SUMSUB_ENV.appToken] || undefined,
  secretKey: env[SUMSUB_ENV.secretKey] || undefined,
  webhookSecret: env[SUMSUB_ENV.webhookSecret] || undefined,
  baseUrl: stripTrailingSlashes(
    env[SUMSUB_ENV.baseUrl] || SUMSUB_DEFAULTS.baseUrl,
  ),
  levelName: env[SUMSUB_ENV.levelName] || SUMSUB_DEFAULTS.levelName,
  tokenTtlSecs: positiveInt(
    env[SUMSUB_ENV.tokenTtlSecs],
    SUMSUB_DEFAULTS.tokenTtlSecs,
  ),
  requestTimeoutMs: positiveInt(
    env[SUMSUB_ENV.requestTimeoutMs],
    SUMSUB_DEFAULTS.requestTimeoutMs,
  ),
});

// The environment variable names of the required settings that are unset
export const missingSumsubConfig = (
  config: SumsubConfig,
  required: readonly SumsubConfigKey[] = SUMSUB_CREDENTIALS,
): string[] => required.filter(key => !config[key]).map(key => SUMSUB_ENV[key]);

// A setting the adapter cannot do without
export class SumsubConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `Sumsub provider: missing required environment variables: ${missing.join(', ')}`,
    );
    this.name = 'SumsubConfigError';
  }
}

// Throw a SumsubConfigError unless every required setting is present
export const assertSumsubConfig = (
  config: SumsubConfig,
  required: readonly SumsubConfigKey[] = SUMSUB_CREDENTIALS,
): void => {
  const missing = missingSumsubConfig(config, required);
  if (missing.length > 0) {
    throw new SumsubConfigError(missing);
  }
};
