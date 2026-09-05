import { getConfig, SUMSUB_DEFAULTS, validateConfig } from '../src/providers/sumsub/config';

const full = {
  SUMSUB_APP_TOKEN: 'app-token',
  SUMSUB_SECRET_KEY: 'secret-key',
  SUMSUB_WEBHOOK_SECRET: 'webhook-secret',
} as NodeJS.ProcessEnv;

describe('getConfig', () => {
  it('falls back to the documented defaults', () => {
    const config = getConfig({} as NodeJS.ProcessEnv);
    expect(config.baseUrl).toBe(SUMSUB_DEFAULTS.baseUrl);
    expect(config.baseUrl).toBe('https://api.sumsub.com');
    expect(config.levelName).toBe(SUMSUB_DEFAULTS.levelName);
    expect(config.tokenTtlSecs).toBe(600);
    expect(config.appToken).toBeUndefined();
  });

  it('reads every variable and trims a trailing slash off the base url', () => {
    const config = getConfig({
      ...full,
      SUMSUB_BASE_URL: 'https://api.sumsub.example/',
      SUMSUB_LEVEL_NAME: 'id-and-liveness',
      SUMSUB_TOKEN_TTL_SECS: '1200',
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({
      appToken: 'app-token',
      secretKey: 'secret-key',
      webhookSecret: 'webhook-secret',
      baseUrl: 'https://api.sumsub.example',
      levelName: 'id-and-liveness',
      tokenTtlSecs: 1200,
    });
  });

  it.each([['0'], ['-5'], ['abc'], ['']])('falls back to the default ttl for %s', (raw) => {
    expect(getConfig({ SUMSUB_TOKEN_TTL_SECS: raw } as NodeJS.ProcessEnv).tokenTtlSecs).toBe(600);
  });
});

describe('validateConfig', () => {
  it('passes when every credential is present', () => {
    expect(() => validateConfig(full)).not.toThrow();
  });

  it('names every missing credential at once', () => {
    expect(() => validateConfig({} as NodeJS.ProcessEnv)).toThrow(
      /SUMSUB_APP_TOKEN.*SUMSUB_SECRET_KEY.*SUMSUB_WEBHOOK_SECRET/s
    );
  });

  it('names only the missing one', () => {
    const { SUMSUB_SECRET_KEY: _omitted, ...rest } = full;
    expect(() => validateConfig(rest as NodeJS.ProcessEnv)).toThrow(
      /Missing required environment variables: SUMSUB_SECRET_KEY$/
    );
  });
});
