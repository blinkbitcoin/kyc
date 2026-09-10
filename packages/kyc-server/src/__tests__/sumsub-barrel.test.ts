// The ./sumsub entry only names the provider directory: anything
// Sumsub-specific added at the package root fails here.
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('src/sumsub.ts', () => {
  it('is a one-line re-export of providers/sumsub/index', () => {
    const statements = fs
      .readFileSync(path.resolve(__dirname, '../sumsub.ts'), 'utf8')
      .replace(/\/\/.*$/gm, '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    expect(statements).toEqual(["export * from './providers/sumsub/index'"]);
  });
});
