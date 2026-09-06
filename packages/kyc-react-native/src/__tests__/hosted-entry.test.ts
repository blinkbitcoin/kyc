// Guard: the ./hosted entry must stay Apollo-free.
//
// Walks the static import graph from src/hosted.ts, following relative
// imports AND crossing into @blinkbitcoin/kyc-core's source (so the core's
// own hosted subpath is walked, not its package.json), and asserts that no
// reached file imports '@apollo/*' or 'graphql'. This is the guarantee that
// a hosted-only app never needs those packages installed.

import * as fs from 'fs';
import * as path from 'path';

const RN_SRC = path.resolve(__dirname, '..');
const CORE_SRC = path.resolve(__dirname, '../../../kyc-core/src');
const CORE_PKG = '@blinkbitcoin/kyc-core';

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g;

const resolveRelative = (fromFile: string, spec: string): string | null => {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [
    base + '.ts',
    base + '.tsx',
    path.join(base, 'index.ts'),
  ]) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const collectExternals = (entry: string): string[] => {
  const seen = new Set<string>();
  const externals = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const match of fs.readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (spec.startsWith('.')) {
        const resolved = resolveRelative(file, spec);
        if (resolved) {
          queue.push(resolved);
        }
      } else if (spec === CORE_PKG || spec.startsWith(`${CORE_PKG}/`)) {
        const sub =
          spec === CORE_PKG ? 'index' : spec.slice(CORE_PKG.length + 1);
        const resolved = resolveRelative(
          path.join(CORE_SRC, 'x.ts'),
          `./${sub}`,
        );
        if (resolved) {
          queue.push(resolved);
        }
      } else {
        externals.add(spec);
      }
    }
  }
  return [...externals];
};

describe('hosted entry (Apollo-free guarantee, across packages)', () => {
  it('never reaches a file that imports @apollo/* or graphql', () => {
    const externals = collectExternals(path.join(RN_SRC, 'hosted.ts'));

    expect(
      externals.filter(
        spec =>
          spec.startsWith('@apollo/') ||
          spec === 'graphql' ||
          spec.startsWith('graphql/'),
      ),
    ).toEqual([]);
    // Sanity: the walk really crossed into RN and core code.
    expect(externals).toEqual(
      expect.arrayContaining([
        'react',
        'react-native',
        'react-native-webview',
        '@react-native-community/netinfo',
      ]),
    );
  });

  it('the full index DOES reach Apollo (walker sanity check)', () => {
    const externals = collectExternals(path.join(RN_SRC, 'index.ts'));
    expect(externals.some(spec => spec.startsWith('@apollo/'))).toBe(true);
  });
});
