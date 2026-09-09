import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // Build without the tests: the guard tests walk kyc-core's sources, which
  // would pull files from outside this package into the dts tree
  tsconfig: 'tsconfig.build.json',
  external: ['express', 'knex', '@blinkbitcoin/kyc-core'],
  format: ['esm', 'cjs'],
  platform: 'node',
  target: 'node18',
  dts: true,
  sourcemap: true,
  clean: true,
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
