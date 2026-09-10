import {
  LOCALE_PATTERN,
  MAX_LEVEL_NAME_LENGTH,
  MAX_LOCALE_LENGTH,
  optionalText,
  requireId,
  validateStartInput,
} from '../validation';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return (error as { extensions: { code: string } }).extensions.code;
  }
};

describe('requireId', () => {
  it('returns a present id and rejects a missing or blank one', () => {
    expect(requireId('abc', 'id')).toBe('abc');
    expect(() => requireId(undefined, 'id')).toThrow(
      'id is required and cannot be empty',
    );
    expect(codeOf(() => requireId('   ', 'sessionId'))).toBe(
      'VALIDATION_ERROR',
    );
  });
});

describe('optionalText', () => {
  it('passes absent values through as undefined', () => {
    expect(optionalText(undefined, 'x', 5)).toBeUndefined();
    expect(optionalText(null, 'x', 5)).toBeUndefined();
  });

  it('rejects a blank value and an over-long one', () => {
    expect(() => optionalText(' ', 'levelName', 5)).toThrow(
      'levelName cannot be empty when provided',
    );
    expect(() => optionalText('abcdef', 'levelName', 5)).toThrow(
      'levelName must be at most 5 characters',
    );
    expect(optionalText('abcde', 'levelName', 5)).toBe('abcde');
  });
});

describe('LOCALE_PATTERN', () => {
  it.each(['en', 'en-US', 'fr-CA'])('accepts %s', locale => {
    expect(LOCALE_PATTERN.test(locale)).toBe(true);
  });

  it.each(['EN', 'en-us', 'english', 'en_US', ''])('rejects %j', locale => {
    expect(LOCALE_PATTERN.test(locale)).toBe(false);
  });
});

describe('validateStartInput', () => {
  it('returns the validated fields', () => {
    expect(
      validateStartInput({
        platform: 'IOS',
        levelName: 'basic-kyc-level',
        locale: 'en-US',
      }),
    ).toEqual({
      platform: 'IOS',
      levelName: 'basic-kyc-level',
      locale: 'en-US',
    });
    expect(validateStartInput({ platform: 'WEB' })).toEqual({
      platform: 'WEB',
      levelName: undefined,
      locale: undefined,
    });
  });

  it('rejects an unknown or missing platform', () => {
    expect(() => validateStartInput({ platform: 'web' as never })).toThrow(
      'platform must be one of WEB, IOS, ANDROID',
    );
    expect(codeOf(() => validateStartInput(undefined))).toBe(
      'VALIDATION_ERROR',
    );
    expect(codeOf(() => validateStartInput(null))).toBe('VALIDATION_ERROR');
  });

  it('bounds the optional texts', () => {
    expect(() =>
      validateStartInput({
        platform: 'WEB',
        levelName: 'x'.repeat(MAX_LEVEL_NAME_LENGTH + 1),
      }),
    ).toThrow(`levelName must be at most ${MAX_LEVEL_NAME_LENGTH} characters`);
    expect(() =>
      validateStartInput({
        platform: 'WEB',
        locale: 'x'.repeat(MAX_LOCALE_LENGTH + 1),
      }),
    ).toThrow(`locale must be at most ${MAX_LOCALE_LENGTH} characters`);
  });

  it('rejects a locale outside the accepted shape', () => {
    expect(() =>
      validateStartInput({ platform: 'WEB', locale: 'english' }),
    ).toThrow('locale must look like "en" or "en-US"');
  });
});
