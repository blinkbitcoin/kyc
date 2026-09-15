import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { requireBuiltLibraries, sourceAliases } from './vite/libraries.ts';

const packages = path.resolve(import.meta.dirname, '../../packages');

// Every service in this repo listens on KYC_PORT_BASE + its offset (table:
// scripts/lib/ports.mjs), so one variable moves a worktree: the dev server
// and the preview take KYC_WEB_PORT, else base + the hosted demo's offset;
// the Playwright configs pass --port per mode (e2e/ports.ts).
const PORT_BASE_DEFAULT = 5100;
const WEB_OFFSET = 1;
const API_OFFSET = 0;
const portBase = Number(process.env.KYC_PORT_BASE || PORT_BASE_DEFAULT);
const webPort = Number(process.env.KYC_WEB_PORT) || portBase + WEB_OFFSET;

export default defineConfig(({ command, mode }) => {
  // The backend this demo calls. Vite exposes process.env.VITE_* to
  // import.meta.env, so defaulting it here is what makes `npm run web` reach
  // THIS worktree's backend: the Playwright configs and live-web.sh pass
  // their own origin, but an interactive run passed nothing and
  // src/config.ts fell back to a frozen :5100 - a neighbour worktree's
  // service. Only when actually serving or building: under vitest there is
  // no dev server and no backend, and the unit tests pin src/config.ts's own
  // last-resort fallback.
  if (mode !== 'test') {
    process.env.VITE_API_ORIGIN ||= `http://localhost:${
      Number(process.env.KYC_API_PORT) || portBase + API_OFFSET
    }`;
  }
  if (command === 'build') {
    requireBuiltLibraries(packages);
  }
  return {
    plugins: [react()],
    server: { port: webPort, strictPort: true },
    preview: { port: webPort, strictPort: true },
    resolve: {
      alias: command === 'serve' ? sourceAliases(packages) : {},
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./vitest.setup.ts'],
      include: [
        'src/**/*.test.{ts,tsx}',
        'vite/**/*.test.ts',
        'e2e/**/*.test.ts',
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'vite/**/*.ts', 'e2e/ports.ts'],
        // main.tsx mounts the app (never imported by a test); declaration
        // files have nothing to execute
        exclude: [
          'src/main.tsx',
          'src/**/*.d.ts',
          'src/**/*.test.*',
          'vite/**/*.test.*',
          'e2e/**/*.test.*',
        ],
        // json-summary is what scripts/ci/coverage-empty.mjs reads
        reporter: ['text', 'json-summary', 'html'],
        thresholds: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  };
});
