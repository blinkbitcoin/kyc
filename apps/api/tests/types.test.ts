// The backend's own normalized vocabulary. These six statuses and three
// platforms are the SAME values as the VerificationStatus /
// VerificationPlatform enums in src/typeDefs.ts (and therefore in
// packages/kyc-core); tests/schema-artifact.test.ts is not enough on its
// own, so the SDL parity is asserted here too.

import type { EnumTypeDefinitionNode } from 'graphql';
import { parse } from 'graphql';
import { typeDefs } from '../src/typeDefs';
import {
  isVerificationPlatform,
  isVerificationStatus,
  TERMINAL_STATUSES,
  VERIFICATION_PLATFORMS,
  VERIFICATION_STATUSES,
} from '../src/types';

const sdlEnum = (name: string): string[] => {
  const node = parse(typeDefs).definitions.find(
    (d): d is EnumTypeDefinitionNode => d.kind === 'EnumTypeDefinition' && d.name.value === name
  );
  expect(node).toBeDefined();
  return ((node as EnumTypeDefinitionNode).values ?? []).map((v) => v.name.value);
};

describe('VERIFICATION_STATUSES', () => {
  it('matches the VerificationStatus enum in the SDL, in order', () => {
    expect([...VERIFICATION_STATUSES]).toEqual(sdlEnum('VerificationStatus'));
  });

  it('guards known and unknown values', () => {
    expect(isVerificationStatus('approved')).toBe(true);
    expect(isVerificationStatus('finallyRejected')).toBe(true);
    expect(isVerificationStatus('APPROVED')).toBe(false);
    expect(isVerificationStatus(undefined)).toBe(false);
    expect(isVerificationStatus(7)).toBe(false);
  });
});

describe('VERIFICATION_PLATFORMS', () => {
  it('matches the VerificationPlatform enum in the SDL, in order', () => {
    expect([...VERIFICATION_PLATFORMS]).toEqual(sdlEnum('VerificationPlatform'));
  });

  it('guards known and unknown values', () => {
    expect(isVerificationPlatform('WEB')).toBe(true);
    expect(isVerificationPlatform('IOS')).toBe(true);
    expect(isVerificationPlatform('ANDROID')).toBe(true);
    expect(isVerificationPlatform('web')).toBe(false);
    expect(isVerificationPlatform(null)).toBe(false);
  });
});

describe('TERMINAL_STATUSES', () => {
  it('holds exactly the two statuses a webhook may never downgrade', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['approved', 'finallyRejected']);
  });
});
