import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { requireBuiltLibraries, sourceAliases } from './vite/libraries.ts';

const packages = path.resolve(import.meta.dirname, '../../packages');

// Every service in this repo runs on a custom port so repos and worktrees
// never clash: the dev server and the preview take KYC_WEB_PORT (5001);
// the Playwright configs pass --port per mode (e2e/ports.ts).
const webPort = Number(process.env.KYC_WEB_PORT || 5001);

export default defineConfig(({ command }) => {
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
        exclude: [
          'src/main.tsx',
          'src/**/*.test.*',
          'vite/**/*.test.*',
          'e2e/**/*.test.*',
        ],
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
