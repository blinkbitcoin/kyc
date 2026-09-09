// Input validation for the verification service. Bounds free-text inputs to
// limit storage/log amplification; each rule throws a VALIDATION_ERROR.

import { Errors } from './errors';
import type { VerificationSessionStartInput } from './types';
import { isVerificationPlatform } from './types';

export const MAX_LEVEL_NAME_LENGTH = 100;
export const MAX_LOCALE_LENGTH = 35; // RFC 5646 language tags stay well under this

/**
 * The locale shapes we accept and hand to a provider SDK: a two-letter
 * language, optionally with a two-letter region ("en", "en-US"). Deliberately
 * narrower than RFC 5646 - it goes into the hosted page's SDK config, so the
 * accepted set is bounded rather than "whatever the client sent".
 */
export const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

// A required identifier: present and not blank
export const requireId = (value: string | undefined, name: string): string => {
  if (!value || value.trim() === '') {
    throw Errors.validationError(`${name} is required and cannot be empty`);
  }
  return value;
};

// An optional text field: absent is fine, present means non-blank and bounded
export const optionalText = (
  value: string | null | undefined,
  name: string,
  maxLength: number,
): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value.trim() === '') {
    throw Errors.validationError(`${name} cannot be empty when provided`);
  }
  if (value.length > maxLength) {
    throw Errors.validationError(
      `${name} must be at most ${maxLength} characters`,
    );
  }
  return value;
};

export interface ValidatedStartInput {
  platform: VerificationSessionStartInput['platform'];
  levelName?: string;
  locale?: string;
}

/** The start input, validated: a known platform, bounded optional texts. */
export const validateStartInput = (
  input: VerificationSessionStartInput | null | undefined,
): ValidatedStartInput => {
  if (!isVerificationPlatform(input?.platform)) {
    throw Errors.validationError('platform must be one of WEB, IOS, ANDROID');
  }
  const levelName = optionalText(
    input.levelName,
    'levelName',
    MAX_LEVEL_NAME_LENGTH,
  );
  const locale = optionalText(input.locale, 'locale', MAX_LOCALE_LENGTH);
  if (locale !== undefined && !LOCALE_PATTERN.test(locale)) {
    throw Errors.validationError('locale must look like "en" or "en-US"');
  }
  return { platform: input.platform, levelName, locale };
};
