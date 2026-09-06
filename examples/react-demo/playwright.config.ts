import { defineConfig } from '@playwright/test';

// Browser E2E for the web demo, hosted mode (the default). Drives the real
// Vite app (:5173) embedding the backend's real mock verification page
// (:4000) in a genuinely cross-origin iframe - the postMessage path jsdom
// can only fake.
//
// Prerequisite (handled by `make e2e-web` at the repo root): the dockerized
// test database is up and migrated; both servers below are started here.
export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/proxy.spec.ts'],
  timeout: 30_000,
  // Retry once in CI only: a flaky runner shouldn't fail the suite, but a
  // real failure should fail fast locally instead of being masked by a retry.
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    {
      command:
        'KYC_PROVIDER=mock npx dotenv-cli -e apps/api/.env.test -- npm run dev -w apps/api',
      cwd: '../..',
      url: 'http://localhost:4000/health',
      // In CI, a listener already on :4000/:5173 is a foreign leftover from a
      // previous job, never this suite's own server - it must never be
      // adopted, so CI always starts its own and fails if the port is taken.
      // Locally, reusing a dev server already running on these ports is the
      // whole point.
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
