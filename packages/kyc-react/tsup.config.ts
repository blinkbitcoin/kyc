import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/hosted.ts', 'src/sumsub.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', '@apollo/client', 'graphql', '@blinkbitcoin/kyc-core'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
