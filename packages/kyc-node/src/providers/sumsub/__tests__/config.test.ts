import {
  assertSumsubConfig,
  missingSumsubConfig,
  SUMSUB_CREDENTIALS,
  SUMSUB_DEFAULTS,
  SUMSUB_ENV,
  SumsubConfigError,
  sumsubConfigFromEnv,
} from '../config';

const full = {
  SUMSUB_APP_TOKEN: 'app-token',
  SUMSUB_SECRET_KEY: 'secret-key',
  SUMSUB_WEBHOOK_SECRET: 'webhook-secret',
};

describe('sumsubConfigFromEnv', () => {
  it('falls back to the documented defaults', () => {
    const config = sumsubConfigFromEnv({});
    expect(config.baseUrl).toBe(SUMSUB_DEFAULTS.baseUrl);
    expect(config.baseUrl).toBe('https://api.sumsub.com');
    expect(config.levelName).toBe(SUMSUB_DEFAULTS.levelName);
    expect(config.tokenTtlSecs).toBe(600);
    expect(config.requestTimeoutMs).toBe(10000);
    expect(config.appToken).toBeUndefined();
  });

  it('reads every variable and trims a trailing slash off the base url', () => {
    expect(
      sumsubConfigFromEnv({
        ...full,
        SUMSUB_BASE_URL: 'https://api.sumsub.example/',
        SUMSUB_LEVEL_NAME: 'id-and-liveness',
        SUMSUB_TOKEN_TTL_SECS: '1200',
        SUMSUB_REQUEST_TIMEOUT_MS: '2500',
      }),
    ).toEqual({
      appToken: 'app-token',
      secretKey: 'secret-key',
      webhookSecret: 'webhook-secret',
      baseUrl: 'https://api.sumsub.example',
      levelName: 'id-and-liveness',
      tokenTtlSecs: 1200,
      requestTimeoutMs: 2500,
    });
  });

  it.each([['0'], ['-5'], ['abc'], ['']])(
    'falls back to the default ttl and timeout for %j',
    raw => {
      const config = sumsubConfigFromEnv({
        SUMSUB_TOKEN_TTL_SECS: raw,
        SUMSUB_REQUEST_TIMEOUT_MS: raw,
      });
      expect(config.tokenTtlSecs).toBe(600);
      expect(config.requestTimeoutMs).toBe(10000);
    },
  );

  it('reads process.env by default and treats an empty credential as unset', () => {
    process.env.SUMSUB_APP_TOKEN = '';
    expect(sumsubConfigFromEnv().appToken).toBeUndefined();
    delete process.env.SUMSUB_APP_TOKEN;
  });

  it('names the variable behind every setting', () => {
    expect(
      Object.values(SUMSUB_ENV).every(name => name.startsWith('SUMSUB_')),
    ).toBe(true);
    expect(SUMSUB_CREDENTIALS).toEqual([
      'appToken',
      'secretKey',
      'webhookSecret',
    ]);
  });
});

describe('assertSumsubConfig', () => {
  it('passes when every credential is present', () => {
    expect(() => assertSumsubConfig(sumsubConfigFromEnv(full))).not.toThrow();
    expect(missingSumsubConfig(sumsubConfigFromEnv(full))).toEqual([]);
  });

  it('names every missing credential at once, as a SumsubConfigError', () => {
    const config = sumsubConfigFromEnv({});
    expect(missingSumsubConfig(config)).toEqual([
      'SUMSUB_APP_TOKEN',
      'SUMSUB_SECRET_KEY',
      'SUMSUB_WEBHOOK_SECRET',
    ]);
    let caught: unknown;
    try {
      assertSumsubConfig(config);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SumsubConfigError);
    expect((caught as SumsubConfigError).missing).toHaveLength(3);
    expect((caught as Error).message).toMatch(
      /SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_WEBHOOK_SECRET/,
    );
  });

  it('names only the missing one, and takes another required set', () => {
    const rest = {
      SUMSUB_APP_TOKEN: full.SUMSUB_APP_TOKEN,
      SUMSUB_WEBHOOK_SECRET: full.SUMSUB_WEBHOOK_SECRET,
    };
    expect(() => assertSumsubConfig(sumsubConfigFromEnv(rest))).toThrow(
      /missing required environment variables: SUMSUB_SECRET_KEY$/,
    );
    expect(() =>
      assertSumsubConfig(sumsubConfigFromEnv(rest), ['appToken']),
    ).not.toThrow();
  });
});
