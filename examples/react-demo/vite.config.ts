import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { requireBuiltLibraries, sourceAliases } from './vite/libraries.ts';

const packages = path.resolve(import.meta.dirname, '../../packages');

export default defineConfig(({ command }) => {
  if (command === 'build') {
    requireBuiltLibraries(packages);
  }
  return {
    plugins: [react()],
    resolve: {
      alias: command === 'serve' ? sourceAliases(packages) : {},
    },
    test: {
      environment: 'jsdom',
      globals: true,
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
