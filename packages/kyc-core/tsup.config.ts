import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/hosted.ts', 'src/testing.ts', 'src/sumsub.ts'],
  // Build without the tests: the guard tests walk other packages' sources,
  // which would pull files from outside this package into the dts tree
  tsconfig: 'tsconfig.build.json',
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@apollo/client', 'graphql'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
