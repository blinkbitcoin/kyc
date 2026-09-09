// Guard: applyStatusTransition (sessions.ts) is the only caller of the
// stores' conditional status write, so every status change carries its
// audit row and runs inside one transaction. The stores implement the write;
// nothing else may call it.

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
const WRITERS = ['sessions.ts', 'store.ts', path.join('knex', 'store.ts')].map(
  file => path.join(SRC, file),
);

const listSources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : listSources(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });

describe('the single write path', () => {
  it('nothing outside the domain and the stores calls updateSessionStatus', () => {
    const sources = listSources(SRC).filter(file => !WRITERS.includes(file));
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      const callers = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter(line => /\.updateSessionStatus\(/.test(line));
      expect({ file, callers }).toEqual({ file, callers: [] });
    }
  });

  it('the domain does call it (walker sanity check)', () => {
    expect(fs.readFileSync(path.join(SRC, 'sessions.ts'), 'utf8')).toContain(
      '.updateSessionStatus(',
    );
  });
});
