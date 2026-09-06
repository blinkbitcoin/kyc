import { defineConfig } from '@playwright/test';

// Browser E2E for proxy mode: the same real stack as the hosted suite, but
// the demo is built with VITE_KYC_MODE=proxy on a separate port (5174) so it
// cannot collide with the hosted Vite. In proxy mode the backend owns the
// whole session lifecycle (create, refresh, webhook-driven status) and the
// component embeds the url the mutation returned - so this suite proves the
// Apollo path, not a second embedding mechanism.
//
// 5174 is already in apps/api/.env.test's CORS_ALLOWED_ORIGINS.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/proxy.spec.ts',
  timeout: 30_000,
  retries: 0,
  use: { baseURL: 'http://localhost:5174' },
  webServer: [
    {
      command:
        'KYC_PROVIDER=mock npx dotenv-cli -e apps/api/.env.test -- npm run dev -w apps/api',
      cwd: '../..',
      url: 'http://localhost:4000/health',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'VITE_KYC_MODE=proxy npm run dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
