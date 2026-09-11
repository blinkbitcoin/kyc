import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const fromRoot = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    // The workspace packages straight from source (no build needed for
    // tests); the subpaths first so the bare name does not swallow them
    alias: [
      {
        find: '@blinkbitcoin/kyc-node/express',
        replacement: fromRoot('../../packages/kyc-node/src/express.ts'),
      },
      {
        find: '@blinkbitcoin/kyc-node/knex',
        replacement: fromRoot('../../packages/kyc-node/src/knex.ts'),
      },
      {
        find: '@blinkbitcoin/kyc-node/sumsub',
        replacement: fromRoot('../../packages/kyc-node/src/sumsub.ts'),
      },
      {
        find: /^@blinkbitcoin\/kyc-node$/,
        replacement: fromRoot('../../packages/kyc-node/src/index.ts'),
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
    include: ['tests/e2e/**/*.e2e.test.ts'],
    // Migrations run once here, before any file, instead of in every file's
    // beforeAll (see tests/e2e/globalSetup.ts).
    globalSetup: ['./tests/e2e/globalSetup.ts'],
    testTimeout: 30000,
    // beforeAll waits for a container that may still be starting; the 10s
    // default was the flake's last hiding place.
    hookTimeout: 30000,
    // Run test files sequentially (equivalent to Jest's --runInBand) to
    // avoid parallel execution issues against the shared test database.
    fileParallelism: false,
  },
});
