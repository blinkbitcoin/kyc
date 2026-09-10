import { isMountable } from '../mountable';

import type { VerificationSource } from '@blinkbitcoin/kyc-core';
import type { MountableSource } from '../mountable';

const plain: VerificationSource = {
  start: async () => ({ provider: 'mock' }),
  interpret: () => null,
};

const mountable: MountableSource = {
  ...plain,
  mount: () => () => {},
};

describe('isMountable', () => {
  it('recognises a source that can mount itself', () => {
    expect(isMountable(mountable)).toBe(true);
  });

  it('rejects a source without a mount function', () => {
    expect(isMountable(plain)).toBe(false);
  });
});
