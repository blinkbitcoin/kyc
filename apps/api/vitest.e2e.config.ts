import { defineConfig } from 'vitest/config';

export default defineConfig({
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
