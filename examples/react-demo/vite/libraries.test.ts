import type fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { requireBuiltLibraries, sourceAliases } from './libraries';

describe('sourceAliases', () => {
  it('maps each package alias to its source entry under the given packages dir', () => {
    const aliases = sourceAliases('/repo/packages');

    expect(aliases).toEqual({
      '@blinkbitcoin/kyc-react': '/repo/packages/kyc-react/src/index.ts',
      '@blinkbitcoin/kyc-core/hosted': '/repo/packages/kyc-core/src/hosted.ts',
      '@blinkbitcoin/kyc-core': '/repo/packages/kyc-core/src/index.ts',
    });
  });

  it('orders the subpath alias before the bare package alias', () => {
    const aliases = sourceAliases('/repo/packages');

    expect(Object.keys(aliases)).toEqual([
      '@blinkbitcoin/kyc-react',
      '@blinkbitcoin/kyc-core/hosted',
      '@blinkbitcoin/kyc-core',
    ]);
  });
});

describe('requireBuiltLibraries', () => {
  it('passes when both built entries exist', () => {
    const exists = vi.fn().mockReturnValue(true);

    expect(() => requireBuiltLibraries('/repo/packages', exists)).not.toThrow();
  });

  it('checks kyc-core before kyc-react', () => {
    const exists = vi.fn().mockReturnValue(true);

    requireBuiltLibraries('/repo/packages', exists);

    expect(exists).toHaveBeenNthCalledWith(
      1,
      '/repo/packages/kyc-core/dist/index.mjs',
    );
    expect(exists).toHaveBeenNthCalledWith(
      2,
      '/repo/packages/kyc-react/dist/index.mjs',
    );
  });

  it('throws naming the first missing entry, checked in order', () => {
    const exists = vi.fn(
      (entry: fs.PathLike) => !entry.toString().includes('kyc-core'),
    );

    expect(() => requireBuiltLibraries('/repo/packages', exists)).toThrow(
      'packages/kyc-core/dist/index.mjs is missing: run `npm run build` at the repo root before building the demo',
    );
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('throws naming kyc-react when only it is missing', () => {
    const exists = vi.fn(
      (entry: fs.PathLike) => !entry.toString().includes('kyc-react'),
    );

    expect(() => requireBuiltLibraries('/repo/packages', exists)).toThrow(
      'packages/kyc-react/dist/index.mjs is missing: run `npm run build` at the repo root before building the demo',
    );
    expect(exists).toHaveBeenCalledTimes(2);
  });
});
