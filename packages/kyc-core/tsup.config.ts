import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/hosted.ts', 'src/testing.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@apollo/client', 'graphql'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
