import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Unit tests read the packages' TypeScript sources: no build step before
// `npm test`, and a package change is picked up immediately. Runtime and the
// E2E suite deliberately do NOT alias - they resolve dist/ through the
// workspace link, exactly as a published consumer would (apps/api's
// build:deps hook makes sure it is built first).
const fromRoot = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    // Exact matches only: a bare-string alias is a prefix match in Vite, so
    // '@blinkbitcoin/kyc-core' would also swallow '.../sumsub' and
    // '.../package.json' and point them at the root source file.
    alias: [
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
      // by tests) and is not meaningfully unit-testable.
      exclude: ['src/index.ts'],
      // json-summary feeds scripts/coverage-badge.mjs (README badge + HTML report)
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
