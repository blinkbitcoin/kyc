// Guard: this package reaches @blinkbitcoin/kyc-core only through its
// Apollo-free entries (/sumsub, /hosted) - never the root, which pulls
// @apollo/client and graphql - and never a client-side runtime. Walks the
// import graph from every entry, crossing into core's source.

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
const CORE_SRC = path.resolve(__dirname, '../../../kyc-core/src');
const CORE_PKG = '@blinkbitcoin/kyc-core';

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g;
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

export const collectGraph = (
  entry: string,
): { files: string[]; externals: string[] } => {
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
        externals.add(spec);
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
  return { files: [...seen], externals: [...externals] };
};

const ENTRIES = ['index.ts', 'express.ts', 'knex.ts', 'sumsub.ts'].filter(
  entry => fs.existsSync(path.join(SRC, entry)),
);

describe('the core boundary', () => {
  it.each(ENTRIES)(
    '%s never reaches Apollo, graphql, the core root or a client runtime',
    entry => {
      const { externals } = collectGraph(path.join(SRC, entry));
      const offenders = externals.filter(
        spec =>
          spec.startsWith('@apollo/') ||
          spec === 'graphql' ||
          spec.startsWith('graphql/') ||
          spec === CORE_PKG ||
          spec === 'react' ||
          spec === 'react-native',
      );
      expect(offenders).toEqual([]);
    },
  );

  it('the walker crosses into core (sanity)', () => {
    const { files } = collectGraph(path.join(SRC, 'index.ts'));
    expect(files.length).toBeGreaterThan(10);
  });
});
