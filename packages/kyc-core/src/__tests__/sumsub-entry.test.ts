// Guards on the provider boundary:
//
// 1. The ./sumsub entry must stay Apollo-free: a native-SDK or hosted host
//    installs it without @apollo/client or graphql.
// 2. The Sumsub surface lives with the provider: src/sumsub.ts only names
//    providers/sumsub/entry (anything Sumsub-specific added at the root
//    fails here).
// 3. Nothing neutral reaches a provider: no module under verification/, and
//    none of the other entries (hosted, testing), imports a providers/ file -
//    a provider binds itself on top of the neutral layer, never the other
//    way round.

import * as fs from 'fs';
import * as path from 'path';

import {
  apolloOffenders,
  collectImportGraph,
  isReExportOnly,
  listSources,
} from './support/importGraph';

const SRC = path.resolve(__dirname, '..');
const PKG = '@blinkbitcoin/kyc-core';
const PROVIDERS_DIR = `${path.sep}providers${path.sep}`;

const reachedProviders = (entry: string): string[] =>
  collectImportGraph(entry, PKG, SRC).files.filter(file =>
    file.includes(PROVIDERS_DIR),
  );

describe('the ./sumsub entry', () => {
  it('never reaches a file that imports @apollo/* or graphql', () => {
    const { files, externals } = collectImportGraph(
      path.join(SRC, 'sumsub.ts'),
      PKG,
      SRC,
    );
    expect(files.length).toBeGreaterThan(5); // sanity: the walk followed the graph
    expect(apolloOffenders(externals)).toEqual([]);
  });

  it('reaches the provider and the neutral hosted layer', () => {
    const { files } = collectImportGraph(path.join(SRC, 'sumsub.ts'), PKG, SRC);
    expect(files).toEqual(
      expect.arrayContaining([
        path.join(SRC, 'providers/sumsub/mapping.ts'),
        path.join(SRC, 'hosted.ts'),
      ]),
    );
  });

  it('is a one-line re-export of providers/sumsub/entry', () => {
    const file = path.join(SRC, 'sumsub.ts');
    expect(isReExportOnly(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toContain(
      "export * from './providers/sumsub/entry'",
    );
  });
});

describe('provider boundary (the neutral layer never imports providers/)', () => {
  it('no verification/ module reaches a providers/ file', () => {
    const sources = listSources(path.join(SRC, 'verification'));
    expect(sources.length).toBeGreaterThan(5); // sanity: the listing walked verification/
    for (const source of sources) {
      expect({ source, reached: reachedProviders(source) }).toEqual({
        source,
        reached: [],
      });
    }
  });

  it.each(['hosted.ts', 'testing.ts', 'errors.ts', 'client.ts'])(
    '%s reaches no providers/ file',
    entry => {
      expect(reachedProviders(path.join(SRC, entry))).toEqual([]);
    },
  );

  it('isReExportOnly rejects a file with logic (walker sanity check)', () => {
    expect(isReExportOnly(path.join(SRC, 'verification/bridge.ts'))).toBe(
      false,
    );
  });
});
