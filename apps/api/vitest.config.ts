import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Unit tests read the packages' TypeScript sources: no build step before
// `npm test`, and a package change is picked up immediately. A regex alias
// is an exact match; a bare-string alias is a prefix match in Vite, so the
// bare package names use regexes and the subpaths come first.
const fromRoot = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    // The workspace packages straight from source (no build needed for
    // tests); the subpaths first so the bare name does not swallow them
    alias: [
      {
        find: '@blinkbitcoin/kyc-server/express',
        replacement: fromRoot('../../packages/kyc-server/src/express.ts'),
      },
      {
        find: '@blinkbitcoin/kyc-server/knex',
        replacement: fromRoot('../../packages/kyc-server/src/knex.ts'),
      },
      {
        find: '@blinkbitcoin/kyc-server/sumsub',
        replacement: fromRoot('../../packages/kyc-server/src/sumsub.ts'),
      },
      {
        find: /^@blinkbitcoin\/kyc-server$/,
        replacement: fromRoot('../../packages/kyc-server/src/index.ts'),
      },
      {
        find: /^@blinkbitcoin\/kyc-core\/sumsub$/,
        replacement: fromRoot('../../packages/kyc-core/src/sumsub.ts'),
      },
      {
        find: /^@blinkbitcoin\/kyc-core\/hosted$/,
        replacement: fromRoot('../../packages/kyc-core/src/hosted.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // e2e has its own config (real Postgres)
    exclude: ['tests/e2e/**'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // index.ts is the server bootstrap (binds a real port, never imported
      // by tests) and is not meaningfully unit-testable; errors, typeDefs,
      // types and providers/port only re-export the package (nothing to cover)
      exclude: [
        'src/index.ts',
        'src/errors.ts',
        'src/typeDefs.ts',
        'src/types.ts',
        'src/providers/port.ts',
      ],
      // json-summary feeds scripts/coverage-badge.mjs (README badge + HTML report)
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
