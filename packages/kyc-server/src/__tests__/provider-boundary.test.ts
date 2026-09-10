// The provider boundary, mechanically: every adapter lives under
// src/providers/<name>/ and the generic layer reaches a provider only through
// the few modules named here. A new import of providers/ anywhere else - or a
// provider importing another provider - fails this test rather than a review.
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const PROVIDERS = path.join(SRC, 'providers');

// Generic modules allowed to import providers/, and why.
const ALLOWED_IMPORTERS = new Set([
  'registry.ts', // the composition root: providerFromEnv over every adapter
  'index.ts', // the root entry re-exports the adapters
  'sumsub.ts', // the ./sumsub entry
]);

const listTs = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : listTs(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });

const importsOf = (file: string): string[] =>
  [...fs.readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map(m => m[1]);

const providerOf = (file: string): string | undefined =>
  path.relative(PROVIDERS, file).split(path.sep)[0];

describe('provider boundary (src/providers/<name>/)', () => {
  const generic = listTs(SRC).filter(f => !f.startsWith(PROVIDERS));
  const adapters = fs
    .readdirSync(PROVIDERS, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  it('every adapter is a directory under providers/ with a provider module', () => {
    expect(adapters.sort()).toEqual(['mock', 'sumsub']);
    for (const name of adapters) {
      expect(fs.existsSync(path.join(PROVIDERS, name, 'provider.ts'))).toBe(
        true,
      );
    }
  });

  it('only the named generic modules import a provider', () => {
    expect(generic.length).toBeGreaterThan(10); // sanity: the walk saw src/
    const offenders = generic
      .filter(f => importsOf(f).some(spec => spec.includes('providers/')))
      .map(f => path.relative(SRC, f))
      .filter(rel => !ALLOWED_IMPORTERS.has(rel));
    expect(offenders).toEqual([]);
  });

  it('no provider imports another provider', () => {
    for (const file of listTs(PROVIDERS)) {
      const own = providerOf(file);
      const foreign = importsOf(file).filter(spec => {
        const target = path.resolve(path.dirname(file), spec);
        return target.startsWith(PROVIDERS) && providerOf(target) !== own;
      });
      expect({ file: path.relative(SRC, file), foreign }).toEqual({
        file: path.relative(SRC, file),
        foreign: [],
      });
    }
  });

  it('nothing outside providers/ names Sumsub in code', () => {
    // Comments may explain the Sumsub case; code must not branch on it
    const offenders = generic
      .filter(f => !ALLOWED_IMPORTERS.has(path.relative(SRC, f)))
      .filter(f =>
        fs
          .readFileSync(f, 'utf8')
          .split('\n')
          .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
          .some(line => /sumsub/i.test(line)),
      )
      .map(f => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
