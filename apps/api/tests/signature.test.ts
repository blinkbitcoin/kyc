import crypto from 'crypto';
import { vi } from 'vitest';
import {
  DIGEST_ALGORITHMS,
  hmacHex,
  timingSafeEqualString,
  verifyHexDigest,
} from '../src/signature';

const SECRET = 'webhook-secret';
const BODY = '{"type":"applicantReviewed"}';

describe('DIGEST_ALGORITHMS', () => {
  it('allows exactly the three Sumsub digest algorithms', () => {
    expect(Object.keys(DIGEST_ALGORITHMS).sort()).toEqual([
      'HMAC_SHA1_HEX',
      'HMAC_SHA256_HEX',
      'HMAC_SHA512_HEX',
    ]);
  });
});

describe('hmacHex', () => {
  it('produces the same digest as node crypto', () => {
    expect(hmacHex('sha256', SECRET, BODY)).toBe(
      crypto.createHmac('sha256', SECRET).update(BODY, 'utf8').digest('hex')
    );
  });
});

describe('timingSafeEqualString', () => {
  it('is true for identical strings and false otherwise', () => {
    expect(timingSafeEqualString('abcd', 'abcd')).toBe(true);
    expect(timingSafeEqualString('abcd', 'abce')).toBe(false);
  });

  it('is false for different lengths without throwing', () => {
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false);
  });
});

describe('verifyHexDigest', () => {
  const valid = (algorithm = 'HMAC_SHA256_HEX') =>
    hmacHex(DIGEST_ALGORITHMS[algorithm as keyof typeof DIGEST_ALGORITHMS], SECRET, BODY);

  afterEach(() => {
    delete process.env.ALLOW_INSECURE_DEV;
    process.env.ALLOW_INSECURE_DEV = 'true'; // tests/setup.ts default
    vi.restoreAllMocks();
  });

  it('accepts a correct digest for each allowed algorithm', () => {
    for (const name of Object.keys(DIGEST_ALGORITHMS)) {
      expect(
        verifyHexDigest({
          signature: valid(name),
          algorithm: name,
          body: BODY,
          secret: SECRET,
        })
      ).toBe(true);
    }
  });

  it('defaults to HMAC_SHA256_HEX when no algorithm header is present', () => {
    expect(
      verifyHexDigest({ signature: valid(), algorithm: undefined, body: BODY, secret: SECRET })
    ).toBe(true);
  });

  it('rejects an unknown algorithm', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      verifyHexDigest({ signature: valid(), algorithm: 'HMAC_MD5_HEX', body: BODY, secret: SECRET })
    ).toBe(false);
  });

  // A plain object inherits these from Object.prototype, so a truthiness
  // check on DIGEST_ALGORITHMS[name] would have let them through.
  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'rejects the inherited property %s as an algorithm name',
    (name) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(
        verifyHexDigest({ signature: valid(), algorithm: name, body: BODY, secret: SECRET })
      ).toBe(false);
    }
  );

  it('rejects a wrong digest, an empty digest and a missing digest', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(verifyHexDigest({ signature: 'deadbeef', body: BODY, secret: SECRET })).toBe(false);
    expect(verifyHexDigest({ signature: '  ', body: BODY, secret: SECRET })).toBe(false);
    expect(verifyHexDigest({ signature: undefined, body: BODY, secret: SECRET })).toBe(false);
  });

  it('rejects a digest computed over a different body', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(verifyHexDigest({ signature: valid(), body: `${BODY} `, secret: SECRET })).toBe(false);
  });

  it('passes with a warning when no secret is configured and insecure dev is allowed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(verifyHexDigest({ signature: undefined, body: BODY, secret: undefined })).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('signature verification disabled'));
  });

  it('fails closed when no secret is configured and insecure dev is not allowed', () => {
    delete process.env.ALLOW_INSECURE_DEV;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(verifyHexDigest({ signature: 'x', body: BODY, secret: undefined })).toBe(false);
    expect(error).toHaveBeenCalledWith(
      'Security event:',
      expect.stringContaining('not configured')
    );
  });

  it('logs the client ip when one is supplied', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    verifyHexDigest({ signature: 'bad', body: BODY, secret: SECRET, ip: '203.0.113.7' });
    expect(error).toHaveBeenCalledWith('Security event:', expect.stringContaining('203.0.113.7'));
  });
});
