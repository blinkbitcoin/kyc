import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { requireBuiltLibraries, sourceAliases } from './vite/libraries';

const packages = path.resolve(__dirname, '../../packages');

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
      include: ['src/**/*.test.{ts,tsx}', 'vite/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}', 'vite/**/*.ts'],
        exclude: ['src/main.tsx', 'src/**/*.test.*', 'vite/**/*.test.*'],
        thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  };
});
