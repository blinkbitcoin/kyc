// Guards on the provider boundary, across packages:
//
// 1. The ./sumsub entry must stay Apollo-free. Walks the import graph from
//    src/sumsub.ts, following relative imports AND crossing into
//    @blinkbitcoin/kyc-core's source, and asserts no reached file imports
//    '@apollo/*' or 'graphql' - the guarantee that a native-SDK app never
//    needs those peers installed.
// 2. The Sumsub surface lives under providers/sumsub/; src/sumsub.ts only
//    names it.
// 3. Nothing neutral in this package reaches a providers/ file: the hosted
//    entry, the component and the hook know no provider.

import * as fs from 'fs';
import * as path from 'path';

const RN_SRC = path.resolve(__dirname, '..');
const CORE_SRC = path.resolve(__dirname, '../../../kyc-core/src');
const CORE_PKG = '@blinkbitcoin/kyc-core';
const PROVIDERS_DIR = `${path.sep}providers${path.sep}`;

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

const collectGraph = (
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

const apolloOffenders = (externals: string[]): string[] =>
  externals.filter(
    spec =>
      spec.startsWith('@apollo/') ||
      spec === 'graphql' ||
      spec.startsWith('graphql/'),
  );

const reachedProviders = (entry: string): string[] =>
  collectGraph(entry).files.filter(file => file.includes(PROVIDERS_DIR));

describe('the ./sumsub entry (Apollo-free guarantee, across packages)', () => {
  it('never reaches a file that imports @apollo/* or graphql', () => {
    const { externals } = collectGraph(path.join(RN_SRC, 'sumsub.ts'));
    expect(apolloOffenders(externals)).toEqual([]);
    // Sanity: the walk crossed into RN + core code and met the optional peer
    expect(externals).toEqual(
      expect.arrayContaining([
        'react-native',
        'react-native-webview',
        '@react-native-community/netinfo',
        '@sumsub/react-native-mobilesdk-module',
      ]),
    );
  });

  it('is a one-line re-export of providers/sumsub/entry', () => {
    const statements = fs
      .readFileSync(path.join(RN_SRC, 'sumsub.ts'), 'utf8')
      .replace(/\/\/.*$/gm, '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    expect(statements).toEqual(["export * from './providers/sumsub/entry'"]);
  });
});

describe('provider boundary (the neutral layer never imports providers/)', () => {
  it.each([
    'hosted.ts',
    'index.ts',
    'IdentityVerification.tsx',
    'useIdentityVerification.ts',
  ])('%s reaches no providers/ file', entry => {
    expect(reachedProviders(path.join(RN_SRC, entry))).toEqual([]);
  });

  it('the optional native peer is reached only through providers/sumsub/', () => {
    const { externals } = collectGraph(path.join(RN_SRC, 'hosted.ts'));
    expect(externals).not.toContain('@sumsub/react-native-mobilesdk-module');
  });
});
