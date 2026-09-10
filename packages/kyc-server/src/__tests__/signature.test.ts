import { createHmac } from 'node:crypto';
import type { Logger } from '../log';
import {
  DIGEST_ALGORITHMS,
  hmacHex,
  timingSafeEqualString,
  verifyHexDigest,
} from '../signature';

const SECRET = 'webhook-secret';
const BODY = '{"type":"applicantReviewed"}';

const fakeLogger = (): Logger & {
  log: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
} => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() });

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
      createHmac('sha256', SECRET).update(BODY, 'utf8').digest('hex'),
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
    hmacHex(
      DIGEST_ALGORITHMS[algorithm as keyof typeof DIGEST_ALGORITHMS],
      SECRET,
      BODY,
    );

  it('accepts a correct digest for each allowed algorithm', () => {
    for (const name of Object.keys(DIGEST_ALGORITHMS)) {
      expect(
        verifyHexDigest({
          signature: valid(name),
          algorithm: name,
          body: BODY,
          secret: SECRET,
        }),
      ).toBe(true);
    }
  });

  it('defaults to HMAC_SHA256_HEX when no algorithm header is present', () => {
    expect(
      verifyHexDigest({
        signature: valid(),
        algorithm: undefined,
        body: BODY,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('rejects an unknown algorithm', () => {
    const logger = fakeLogger();
    expect(
      verifyHexDigest({
        signature: valid(),
        algorithm: 'HMAC_MD5_HEX',
        body: BODY,
        secret: SECRET,
        logger,
      }),
    ).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Security event:',
      expect.stringContaining('not allowed: HMAC_MD5_HEX'),
    );
  });

  // A plain object inherits these from Object.prototype, so a truthiness
  // check on DIGEST_ALGORITHMS[name] would have let them through.
  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'rejects the inherited property %s as an algorithm name',
    name => {
      expect(
        verifyHexDigest({
          signature: valid(),
          algorithm: name,
          body: BODY,
          secret: SECRET,
          logger: fakeLogger(),
        }),
      ).toBe(false);
    },
  );

  it('rejects a wrong digest, an empty digest and a missing digest', () => {
    const logger = fakeLogger();
    expect(
      verifyHexDigest({
        signature: 'deadbeef',
        body: BODY,
        secret: SECRET,
        logger,
      }),
    ).toBe(false);
    expect(
      verifyHexDigest({ signature: '  ', body: BODY, secret: SECRET, logger }),
    ).toBe(false);
    expect(
      verifyHexDigest({
        signature: undefined,
        body: BODY,
        secret: SECRET,
        logger,
      }),
    ).toBe(false);
    expect(logger.error).toHaveBeenCalledTimes(3);
  });

  it('rejects a digest computed over a different body', () => {
    expect(
      verifyHexDigest({
        signature: valid(),
        body: `${BODY} `,
        secret: SECRET,
        logger: fakeLogger(),
      }),
    ).toBe(false);
  });

  it('passes with a warning when no secret is configured and the host allows it', () => {
    const logger = fakeLogger();
    expect(
      verifyHexDigest({
        signature: undefined,
        body: BODY,
        secret: undefined,
        allowMissingSecret: true,
        logger,
      }),
    ).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('signature verification disabled'),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('fails closed when no secret is configured and the host does not allow it', () => {
    const logger = fakeLogger();
    expect(
      verifyHexDigest({
        signature: 'x',
        body: BODY,
        secret: undefined,
        logger,
      }),
    ).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Security event:',
      expect.stringContaining('not configured'),
    );
  });

  it('logs the client ip when one is supplied, never the body', () => {
    const logger = fakeLogger();
    verifyHexDigest({
      signature: 'bad',
      body: BODY,
      secret: SECRET,
      ip: '203.0.113.7',
      logger,
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Security event:',
      expect.stringContaining('203.0.113.7'),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'applicantReviewed',
    );
  });

  it('logs through console by default', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      verifyHexDigest({ signature: undefined, body: BODY, secret: SECRET }),
    ).toBe(false);
    expect(error).toHaveBeenCalledWith('Security event:', expect.any(String));
    error.mockRestore();
  });
});
