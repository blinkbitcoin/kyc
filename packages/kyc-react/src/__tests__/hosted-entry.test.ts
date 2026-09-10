// Guard: the ./hosted entry must stay Apollo-free.
//
// Walks the import graph (static, dynamic and side-effect) from
// src/hosted.ts and src/sumsub.ts, following relative imports AND crossing
// into @blinkbitcoin/kyc-core's source (so the core's own subpaths are
// walked, not its package.json), and asserts that no reached file imports
// '@apollo/*' or 'graphql'. This is the guarantee that a hosted-only web
// app never needs those packages installed - the same contract as the
// React Native package, walked the same way.

import * as fs from 'fs';
import * as path from 'path';

const WEB_SRC = path.resolve(__dirname, '..');
const CORE_SRC = path.resolve(__dirname, '../../../kyc-core/src');
const CORE_PKG = '@blinkbitcoin/kyc-core';

// Static + type imports/re-exports: import ... from 'x' / export ... from 'x'
const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g;

// What IMPORT_RE misses, and what a lazy `require('@apollo/client')` would
// hide behind: `import('x')` / `require('x')` calls and bare side-effect
// imports (`import 'x'`). Same pattern as the core package's walker.
const DYNAMIC_IMPORT_RE =
  /(?:^|[^\w])(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

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
    const source = fs.readFileSync(file, 'utf8');
    const specs = [
      ...[...source.matchAll(IMPORT_RE)].map(match => match[1]),
      ...[...source.matchAll(DYNAMIC_IMPORT_RE)].map(
        match => match[1] ?? match[2],
      ),
    ];
    for (const spec of specs) {
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

describe('hosted and sumsub entries (Apollo-free guarantee, across packages)', () => {
  it.each(['hosted.ts', 'sumsub.ts'])(
    '%s never reaches a file that imports @apollo/* or graphql',
    entry => {
      const externals = collectExternals(path.join(WEB_SRC, entry));

      expect(
        externals.filter(
          spec =>
            spec.startsWith('@apollo/') ||
            spec === 'graphql' ||
            spec.startsWith('graphql/'),
        ),
      ).toEqual([]);
      // Sanity: the walk really crossed into the component and core code.
      expect(externals).toEqual(expect.arrayContaining(['react']));
    },
  );

  it('the full index DOES reach Apollo (walker sanity check)', () => {
    const externals = collectExternals(path.join(WEB_SRC, 'index.ts'));
    expect(externals.some(spec => spec.startsWith('@apollo/'))).toBe(true);
  });
});
