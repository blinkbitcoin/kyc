// The boot guard: what refuses to start, and what it says when it does.

import { vi } from 'vitest';

import {
  configErrors,
  getAllowedOrigins,
  getPublicBaseUrl,
  getPublicOrigin,
  isInsecureDevAllowed,
  isJwtRequired,
  isWebhookSignatureRequired,
  validateConfig,
} from '../src/config';

// The smallest environment that boots: the dev passthrough, the mock
// provider, no database (tokens only). Tests add what they are about.
const devEnv = (extra: Record<string, string | undefined> = {}) => ({
  ALLOW_INSECURE_DEV: 'true',
  KYC_PROVIDER: 'mock',
  ...extra,
});

// The Sumsub settings an access-token mint needs (dummy values in the real
// shape - nothing here is a credential)
const sumsubEnv = (extra: Record<string, string | undefined> = {}) => ({
  KYC_PROVIDER: 'sumsub',
  SUMSUB_APP_TOKEN: 'app',
  SUMSUB_SECRET_KEY: 'key',
  ...extra,
});

const DATABASE_URL = 'postgres://u@h/db';

describe('isInsecureDevAllowed', () => {
  it('is true only for the exact string "true"', () => {
    expect(isInsecureDevAllowed({ ALLOW_INSECURE_DEV: 'true' })).toBe(true);
    expect(isInsecureDevAllowed({ ALLOW_INSECURE_DEV: 'TRUE' })).toBe(false);
    expect(isInsecureDevAllowed({ ALLOW_INSECURE_DEV: '1' })).toBe(false);
    expect(isInsecureDevAllowed({})).toBe(false);
  });
});

describe('isJwtRequired / isWebhookSignatureRequired', () => {
  it('require secrets unless insecure-dev is allowed', () => {
    expect(isJwtRequired({})).toBe(true);
    expect(isWebhookSignatureRequired({})).toBe(true);
    expect(isJwtRequired({ ALLOW_INSECURE_DEV: 'true' })).toBe(false);
    expect(isWebhookSignatureRequired({ ALLOW_INSECURE_DEV: 'true' })).toBe(false);
  });
});

describe('configErrors - the session source', () => {
  it('refuses an environment that verifies nothing', () => {
    expect(configErrors(sumsubEnv())).toEqual([
      expect.stringMatching(/no session verification is configured/),
    ]);
  });

  it('accepts a JWKS url, a shared secret, the JWT_SECRET alias, or the dev switch', () => {
    expect(configErrors(sumsubEnv({ SESSION_JWKS_URL: 'https://id/jwks' }))).toEqual([]);
    expect(configErrors(sumsubEnv({ SESSION_HS256_SECRET: 's' }))).toEqual([]);
    expect(configErrors(sumsubEnv({ JWT_SECRET: 's' }))).toEqual([]);
    expect(configErrors(devEnv())).toEqual([]);
  });
});

describe('configErrors - the public base URL', () => {
  it('is not needed for tokens alone', () => {
    expect(configErrors(sumsubEnv({ JWT_SECRET: 's' }))).toEqual([]);
  });

  it('is required once sessions are on, outside insecure dev', () => {
    expect(
      configErrors(sumsubEnv({ JWT_SECRET: 's', DATABASE_URL, SUMSUB_WEBHOOK_SECRET: 'w' }))
    ).toEqual([expect.stringMatching(/PUBLIC_BASE_URL is required once sessions are on/)]);
    expect(configErrors(devEnv({ DATABASE_URL }))).toEqual([]);
  });

  it('must be an absolute http(s) URL', () => {
    for (const value of ['not a url', 'mailto:x', 'javascript:alert(1)']) {
      expect(configErrors(devEnv({ DATABASE_URL, PUBLIC_BASE_URL: value }))).toEqual([
        expect.stringMatching(/PUBLIC_BASE_URL must be an absolute http\(s\) URL/),
      ]);
    }
    expect(
      configErrors(devEnv({ DATABASE_URL, PUBLIC_BASE_URL: 'https://kyc.example.com' }))
    ).toEqual([]);
  });
});

describe('configErrors - the provider', () => {
  it('accepts the mock provider in insecure dev', () => {
    expect(configErrors(devEnv())).toEqual([]);
  });

  it('refuses the mock provider outside insecure dev (its webhooks are forgeable)', () => {
    expect(configErrors({ KYC_PROVIDER: 'mock', JWT_SECRET: 's' })).toEqual([
      expect.stringMatching(/KYC_PROVIDER=mock signs its own webhooks/),
    ]);
  });

  it('accepts Sumsub with the settings a mint needs', () => {
    expect(configErrors(sumsubEnv({ ALLOW_INSECURE_DEV: 'true' }))).toEqual([]);
  });

  it('refuses Sumsub without the settings a mint needs', () => {
    expect(configErrors({ ALLOW_INSECURE_DEV: 'true', KYC_PROVIDER: 'sumsub' })).toEqual([
      expect.stringMatching(/SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY/),
    ]);
  });

  it('refuses production on the mock provider and on a sandbox token', () => {
    expect(configErrors(devEnv({ KYC_ENV: 'production' }))).toEqual([
      expect.stringMatching(/mock provider is a demo provider/),
    ]);
    expect(
      configErrors(sumsubEnv({ JWT_SECRET: 's', KYC_ENV: 'production', SUMSUB_APP_TOKEN: 'sbx:x' }))
    ).toEqual([expect.stringMatching(/SUMSUB_APP_TOKEN=sbx:… is a demo setting/)]);
    expect(
      configErrors(
        sumsubEnv({
          JWT_SECRET: 's',
          KYC_ENV: 'production',
          SUMSUB_APP_TOKEN: 'sbx:x',
          KYC_ALLOW_DEMO: 'true',
        })
      )
    ).toEqual([]);
  });

  it('refuses an unknown KYC_PROVIDER instead of silently falling back', () => {
    expect(configErrors(devEnv({ KYC_PROVIDER: 'onfido' }))).toEqual([
      expect.stringMatching(/unknown KYC_PROVIDER: onfido/),
    ]);
  });
});

describe('configErrors - the webhook secret', () => {
  const PUBLIC_BASE_URL = 'https://kyc.example.com';

  it('requires SUMSUB_WEBHOOK_SECRET once sessions are on', () => {
    expect(configErrors(sumsubEnv({ JWT_SECRET: 's', DATABASE_URL, PUBLIC_BASE_URL }))).toEqual([
      expect.stringMatching(/SUMSUB_WEBHOOK_SECRET is required/),
    ]);
  });

  it('does not require it without a database (tokens only)', () => {
    expect(configErrors(sumsubEnv({ JWT_SECRET: 's' }))).toEqual([]);
  });

  it('does not require it for the mock provider', () => {
    expect(configErrors(devEnv({ DATABASE_URL }))).toEqual([]);
  });

  it('is satisfied by the secret, or by the insecure-dev switch', () => {
    expect(
      configErrors(
        sumsubEnv({ JWT_SECRET: 's', DATABASE_URL, PUBLIC_BASE_URL, SUMSUB_WEBHOOK_SECRET: 'w' })
      )
    ).toEqual([]);
    expect(configErrors(sumsubEnv({ ALLOW_INSECURE_DEV: 'true', DATABASE_URL }))).toEqual([]);
  });
});

describe('configErrors - runtime vs capability', () => {
  it('refuses sessions on the edge runtime', () => {
    expect(configErrors(devEnv({ DATABASE_URL }), { runtime: 'edge' })).toEqual([
      expect.stringMatching(/cannot open a Postgres connection/),
    ]);
  });

  it('accepts tokens on the edge runtime', () => {
    expect(configErrors(devEnv(), { runtime: 'edge' })).toEqual([]);
  });
});

describe('validateConfig', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the capabilities that are on', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateConfig(devEnv())).toEqual(['tokens']);
    expect(validateConfig(devEnv({ DATABASE_URL }))).toEqual(['tokens', 'sessions']);
  });

  it('warns when the insecure-dev switch is on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateConfig(devEnv());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ALLOW_INSECURE_DEV=true'));
  });

  it('does not warn for a properly configured deployment', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateConfig(sumsubEnv({ JWT_SECRET: 's' }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('lists every problem at once, with the capabilities that are on', () => {
    expect(() => validateConfig({ KYC_PROVIDER: 'sumsub', DATABASE_URL })).toThrow(
      /capabilities: tokens, sessions/
    );
    expect(() => validateConfig({ KYC_PROVIDER: 'sumsub', DATABASE_URL })).toThrow(
      /no session verification.*PUBLIC_BASE_URL.*SUMSUB_APP_TOKEN.*SUMSUB_WEBHOOK_SECRET/s
    );
  });

  it('reads process.env by default', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // tests/setup.ts sets ALLOW_INSECURE_DEV=true for the whole suite
    expect(validateConfig()).toEqual(['tokens']);
  });
});

describe('getAllowedOrigins', () => {
  it('is empty by default', () => {
    expect(getAllowedOrigins({})).toEqual([]);
  });

  it('splits, trims, and drops blanks', () => {
    expect(getAllowedOrigins({ CORS_ALLOWED_ORIGINS: 'https://a.com, https://b.com ,, ' })).toEqual(
      ['https://a.com', 'https://b.com']
    );
  });
});

describe('getPublicBaseUrl / getPublicOrigin', () => {
  it('defaults to the local origin under insecure dev only', () => {
    const dev = { ALLOW_INSECURE_DEV: 'true' };
    expect(getPublicBaseUrl(dev)).toBe('http://localhost:5100');
    expect(getPublicOrigin(dev)).toBe('http://localhost:5100');
    expect(getPublicBaseUrl({ ...dev, PORT: '5200' })).toBe('http://localhost:5200');
    // Outside insecure dev there is nothing to guess: validateConfig has
    // already refused to boot a sessions deployment without a value.
    expect(getPublicBaseUrl({})).toBe('');
    expect(getPublicOrigin({})).toBe('');
  });

  it('strips trailing slashes and reduces to the origin', () => {
    expect(getPublicBaseUrl({ PUBLIC_BASE_URL: 'https://kyc.example.com/api//' })).toBe(
      'https://kyc.example.com/api'
    );
    expect(getPublicOrigin({ PUBLIC_BASE_URL: 'https://kyc.example.com/api/' })).toBe(
      'https://kyc.example.com'
    );
  });

  it('returns the raw value when it cannot be parsed', () => {
    expect(getPublicOrigin({ PUBLIC_BASE_URL: 'not a url' })).toBe('not a url');
  });

  it('reads process.env by default', () => {
    const before = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = 'https://env.example.com/';
    try {
      expect(getPublicBaseUrl()).toBe('https://env.example.com');
      expect(getPublicOrigin()).toBe('https://env.example.com');
    } finally {
      if (before === undefined) {
        delete process.env.PUBLIC_BASE_URL;
      } else {
        process.env.PUBLIC_BASE_URL = before;
      }
    }
  });
});
