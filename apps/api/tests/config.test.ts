// Tests for the security-config boot validation and helpers.

import { vi } from 'vitest';

import {
  getAllowedOrigins,
  getPublicBaseUrl,
  getPublicOrigin,
  isInsecureDevAllowed,
  isJwtRequired,
  isWebhookSignatureRequired,
  validateSecurityConfig,
} from '../src/config';

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

describe('validateSecurityConfig', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes and warns when insecure-dev is explicitly allowed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateSecurityConfig({ ALLOW_INSECURE_DEV: 'true' })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ALLOW_INSECURE_DEV=true'));
  });

  it('throws when JWT_SECRET is missing and insecure-dev is not allowed', () => {
    expect(() => validateSecurityConfig({})).toThrow(/JWT_SECRET/);
  });

  it('passes with JWT_SECRET set and the default (mock) provider', () => {
    expect(() => validateSecurityConfig({ JWT_SECRET: 's' })).not.toThrow();
  });

  it('requires all three Sumsub credentials when the provider is sumsub', () => {
    expect(() => validateSecurityConfig({ JWT_SECRET: 's', KYC_PROVIDER: 'sumsub' })).toThrow(
      /SUMSUB_APP_TOKEN.*SUMSUB_SECRET_KEY.*SUMSUB_WEBHOOK_SECRET/s
    );
  });

  it('passes for sumsub when every credential is set', () => {
    expect(() =>
      validateSecurityConfig({
        JWT_SECRET: 's',
        KYC_PROVIDER: 'sumsub',
        SUMSUB_APP_TOKEN: 'a',
        SUMSUB_SECRET_KEY: 'b',
        SUMSUB_WEBHOOK_SECRET: 'c',
      })
    ).not.toThrow();
  });

  it('does not require the webhook secret for the mock provider', () => {
    expect(() => validateSecurityConfig({ JWT_SECRET: 's', KYC_PROVIDER: 'mock' })).not.toThrow();
  });

  it('lists every missing secret at once', () => {
    expect(() => validateSecurityConfig({ KYC_PROVIDER: 'sumsub' })).toThrow(
      /JWT_SECRET.*SUMSUB_WEBHOOK_SECRET/s
    );
  });

  it('rejects an unparseable PUBLIC_BASE_URL', () => {
    expect(() => validateSecurityConfig({ JWT_SECRET: 's', PUBLIC_BASE_URL: 'not a url' })).toThrow(
      /PUBLIC_BASE_URL must be an absolute URL/
    );
  });

  it('accepts a well-formed PUBLIC_BASE_URL', () => {
    expect(() =>
      validateSecurityConfig({ JWT_SECRET: 's', PUBLIC_BASE_URL: 'https://kyc.example.com' })
    ).not.toThrow();
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
  it('defaults to localhost:4000', () => {
    expect(getPublicBaseUrl({})).toBe('http://localhost:4000');
    expect(getPublicOrigin({})).toBe('http://localhost:4000');
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
});
