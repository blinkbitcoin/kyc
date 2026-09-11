import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Live verification against the real Sumsub sandbox (tests/live/). Opt-in
// via `npm run test:live` - excluded from the default suite and from CI's
// default jobs (the opt-in Live job runs it: docs/operations/live-e2e-ci.md).
// No setup file: these tests must use the real fetch and real modules. The
// service's .env (make sumsub-env) is loaded when present; values already
// in the environment win (CI, make e2e-live).
const fromRoot = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

loadEnv({ path: fromRoot('./.env'), quiet: true });

export default defineConfig({
  resolve: {
    alias: [
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
    include: ['tests/live/**/*.live.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
