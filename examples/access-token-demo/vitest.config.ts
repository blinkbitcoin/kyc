import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // The workspace packages straight from source (no build needed); the
      // subpaths first so the bare name does not swallow them
      {
        find: '@blinkbitcoin/kyc-server/sumsub',
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/kyc-server/src/sumsub.ts',
        ),
      },
      {
        find: /^@blinkbitcoin\/kyc-server$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/kyc-server/src/index.ts',
        ),
      },
      {
        find: /^@blinkbitcoin\/kyc-core\/sumsub$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/kyc-core/src/sumsub.ts',
        ),
      },
      {
        find: /^@blinkbitcoin\/kyc-core\/hosted$/,
        replacement: path.resolve(
          import.meta.dirname,
          '../../packages/kyc-core/src/hosted.ts',
        ),
      },
    ],
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // index.ts binds a real port; the CI smoke runs it for real
      exclude: ['src/index.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
