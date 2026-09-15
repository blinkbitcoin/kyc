// A worktree runs on its own port block, and KYC_PORT_BASE / KYC_API_PORT
// come from the shell, so a developer's base is not the documented 5100 these
// tests assert. That is machine state, not a property of the code under test.
// It has to be cleared HERE, not in jest.setup.ts: babel.config.js inlines
// both variables into the demo's modules at transform time (the RN bundle has
// no process.env at runtime), so by the time a setup file runs the value is
// already baked in. This file is evaluated by the jest CLI before any worker
// transforms anything. Empty, not deleted: every reader treats an empty value
// as unset, and `delete` does not take on the sandboxed process.env Jest hands
// a test file. A test that exercises the derivation passes the base
// explicitly (resolveBackendPort takes it as an argument).
process.env.KYC_PORT_BASE = '';
process.env.KYC_API_PORT = '';

module.exports = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@apollo/client|graphql|react-native-webview)/)',
  ],
  moduleNameMapper: {
    // Workspace packages resolve straight to source - no build needed. The
    // subpath entries must come before the bare package names.
    '^@blinkbitcoin/kyc-core/hosted$':
      '<rootDir>/../../packages/kyc-core/src/hosted.ts',
    '^@blinkbitcoin/kyc-core/testing$':
      '<rootDir>/../../packages/kyc-core/src/testing.ts',
    '^@blinkbitcoin/kyc-core/sumsub$':
      '<rootDir>/../../packages/kyc-core/src/sumsub.ts',
    '^@blinkbitcoin/kyc-core$':
      '<rootDir>/../../packages/kyc-core/src/index.ts',
    '^@blinkbitcoin/kyc-react-native/hosted$':
      '<rootDir>/../../packages/kyc-react-native/src/hosted.ts',
    '^@blinkbitcoin/kyc-react-native/sumsub$':
      '<rootDir>/../../packages/kyc-react-native/src/sumsub.ts',
    '^@blinkbitcoin/kyc-react-native$':
      '<rootDir>/../../packages/kyc-react-native/src/index.ts',
    // Native-module mocks: webview/netinfo and the Sumsub SDK live with the
    // library that owns them, safe-area is demo-only.
    '^@sumsub/react-native-mobilesdk-module$':
      '<rootDir>/../../packages/kyc-react-native/__mocks__/@sumsub/react-native-mobilesdk-module.ts',
    '^react-native-webview$':
      '<rootDir>/../../packages/kyc-react-native/__mocks__/react-native-webview.tsx',
    '^@react-native-community/netinfo$':
      '<rootDir>/../../packages/kyc-react-native/__mocks__/@react-native-community/netinfo.ts',
    '^react-native-safe-area-context$':
      '<rootDir>/__mocks__/react-native-safe-area-context.tsx',
  },
  collectCoverageFrom: ['App.tsx', 'src/**/*.{ts,tsx}'],
  // json-summary is what scripts/ci/coverage-empty.mjs reads
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
