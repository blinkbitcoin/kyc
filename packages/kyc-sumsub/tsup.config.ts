import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react-native.ts', 'src/web.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@blinkbitcoin/kyc-core',
    '@sumsub/react-native-mobilesdk-module',
    '@sumsub/websdk',
    'react-native',
  ],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
