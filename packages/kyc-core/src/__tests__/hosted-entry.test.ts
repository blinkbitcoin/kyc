// Guard: the ./hosted entry must stay Apollo-free.
//
// Walks the static import graph from src/hosted.ts (following relative
// imports and @blinkbitcoin/kyc-core/* self-references) and asserts no
// reached file imports '@apollo/' or 'graphql'. This is the guarantee that a
// hosted-only consumer never needs those packages installed.

import * as path from 'path';

import { apolloOffenders, collectImportGraph } from './support/importGraph';

const SRC = path.resolve(__dirname, '..');

describe('hosted entry (Apollo-free guarantee)', () => {
  it('never reaches a file that imports @apollo/* or graphql', () => {
    const { files, externals } = collectImportGraph(
      path.join(SRC, 'hosted.ts'),
      '@blinkbitcoin/kyc-core',
      SRC,
    );

    expect(files.length).toBeGreaterThan(2); // sanity: the walk followed the graph
    expect(apolloOffenders(externals)).toEqual([]);
  });

  it('the full index DOES reach Apollo (sanity check that the walker works)', () => {
    const { externals } = collectImportGraph(
      path.join(SRC, 'index.ts'),
      '@blinkbitcoin/kyc-core',
      SRC,
    );
    expect(externals.some(spec => spec.startsWith('@apollo/'))).toBe(true);
  });
});
