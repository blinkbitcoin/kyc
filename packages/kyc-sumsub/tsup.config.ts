import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/react-native.ts', 'src/web.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  // src/native/sdk.ts loads the optional peer with require() so the specifier
  // stays statically resolvable for Metro. `require` does not exist in an ESM
  // module scope, so the ESM build needs tsup's createRequire shim - without
  // it, importing dist/react-native.mjs throws a ReferenceError.
  shims: true,
  clean: true,
  external: [
    '@blinkbitcoin/kyc-core',
    '@sumsub/react-native-mobilesdk-module',
    '@sumsub/websdk',
    'react-native',
  ],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
});
