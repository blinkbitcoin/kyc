// The import-graph walker the guard tests share (not a test: jest ignores
// __tests__/support/). Walks static, dynamic and side-effect imports from an
// entry, following relative imports and @blinkbitcoin/kyc-core/* self-
// references (or, for another package, its own name mapped onto core's
// source), and reports the files reached and the external specifiers seen.

import * as fs from 'fs';
import * as path from 'path';

// Matches static + type imports/re-exports: import ... from 'x' / export ... from 'x'
const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?[^'"]*from\s+['"]([^'"]+)['"]/g;

// Matches what IMPORT_RE misses: `import('x')` / `require('x')` calls
// (dynamic imports, CJS interop) and bare side-effect imports (`import 'x'`).
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

export const collectImportGraph = (
  entry: string,
  selfPackage: string,
  selfSrcDir: string,
): { files: string[]; externals: string[] } => {
  const seen = new Set<string>();
  const externals = new Set<string>();
  const queue = [entry];

  const visitSpec = (fromFile: string, spec: string): void => {
    if (spec.startsWith('.')) {
      const resolved = resolveRelative(fromFile, spec);
      if (!resolved) {
        throw new Error(`unresolved import ${spec} from ${fromFile}`);
      }
      queue.push(resolved);
    } else if (spec === selfPackage || spec.startsWith(`${selfPackage}/`)) {
      // Self-reference to this monorepo package: map onto its src entries
      const sub =
        spec === selfPackage ? 'index' : spec.slice(selfPackage.length + 1);
      const resolved = resolveRelative(
        path.join(selfSrcDir, 'x.ts'),
        `./${sub}`,
      );
      if (!resolved) {
        throw new Error(`unresolved import ${spec} from ${fromFile}`);
      }
      queue.push(resolved);
    } else {
      externals.add(spec);
    }
  };

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      visitSpec(file, match[1]);
    }
    for (const match of source.matchAll(DYNAMIC_IMPORT_RE)) {
      const spec = match[1] ?? match[2];
      if (spec) {
        visitSpec(file, spec);
      }
    }
  }
  return { files: [...seen], externals: [...externals] };
};

/** Every .ts source under `dir` (recursively), tests excluded. */
export const listSources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : listSources(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });

// Comments, then the statements a logic-free barrel may consist of: imports,
// re-exports, and one-name aliases (`export const x = y;` / `export type X = Y;`)
const COMMENT_RE = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;
const BARREL_STATEMENT_RE =
  /^(?:import\s[\s\S]*?\sfrom\s+'[^']+'|export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+'[^']+'|export\s+\*\s+from\s+'[^']+'|export\s+const\s+\w+\s*=\s*\w+|export\s+type\s+\w+\s*=\s*[\w.]+)$/;

/** True when the file is nothing but imports, re-exports and one-name aliases. */
export const isReExportOnly = (file: string): boolean =>
  fs
    .readFileSync(file, 'utf8')
    .replace(COMMENT_RE, '')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0)
    .every(statement => BARREL_STATEMENT_RE.test(statement));

/** The external specifiers that would pull Apollo or graphql into a bundle. */
export const apolloOffenders = (externals: string[]): string[] =>
  externals.filter(
    spec =>
      spec.startsWith('@apollo/') ||
      spec === 'graphql' ||
      spec.startsWith('graphql/'),
  );
