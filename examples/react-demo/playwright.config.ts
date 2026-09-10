import { defineConfig } from '@playwright/test';
import {
  backendServer,
  baseURL,
  retries,
  vitePreviewServer,
} from './e2e/ports';

// Browser E2E for the web demo, hosted mode (the default). Drives the built
// demo (vite preview over the libraries' dist - what a consumer installs)
// embedding the backend's real mock verification page in a genuinely
// cross-origin iframe - the postMessage path jsdom can only fake. Ports are
// from the environment (e2e/ports.ts: KYC_API_PORT, KYC_WEB_PORT).
//
// Prerequisite (handled by `make e2e-web` at the repo root): the libraries
// are built and the dockerized test database is up and migrated; both
// servers below are started here.
export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/proxy.spec.ts', '**/*.test.ts'],
  timeout: 30_000,
  retries,
  use: { baseURL: baseURL('hosted') },
  webServer: [backendServer(), vitePreviewServer('hosted')],
});
