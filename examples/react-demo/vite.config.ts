import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@blinkbitcoin/kyc-react': path.resolve(
        __dirname,
        '../../packages/kyc-react/src/index.ts',
      ),
      '@blinkbitcoin/kyc-core/hosted': path.resolve(
        __dirname,
        '../../packages/kyc-core/src/hosted.ts',
      ),
      '@blinkbitcoin/kyc-core': path.resolve(
        __dirname,
        '../../packages/kyc-core/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.test.*'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
