import { defineConfig } from '@playwright/test';
import {
  backendServer,
  baseURL,
  retries,
  vitePreviewServer,
} from './e2e/ports';

// Browser E2E for proxy mode: the same real stack as the hosted suite, but
// the demo is built with VITE_KYC_MODE=proxy on its own port so it cannot
// collide with the hosted demo (e2e/ports.ts: KYC_WEB_PROXY_PORT). In proxy
// mode the backend owns the whole session lifecycle (create, refresh,
// webhook-driven status) and the component embeds the url the mutation
// returned - so this suite proves the Apollo path, not a second embedding
// mechanism.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/proxy.spec.ts',
  timeout: 30_000,
  retries,
  use: { baseURL: baseURL('proxy') },
  webServer: [backendServer(), vitePreviewServer('proxy')],
});
