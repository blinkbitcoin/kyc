module.exports = {
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@apollo/client|graphql|react-native-webview)/)',
  ],
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core/hosted$':
      '<rootDir>/../../packages/kyc-core/src/hosted.ts',
    '^@blinkbitcoin/kyc-core$':
      '<rootDir>/../../packages/kyc-core/src/index.ts',
    '^@blinkbitcoin/kyc-react-native/hosted$':
      '<rootDir>/../../packages/kyc-react-native/src/hosted.ts',
    '^@blinkbitcoin/kyc-react-native$':
      '<rootDir>/../../packages/kyc-react-native/src/index.ts',
    '^react-native-webview$':
      '<rootDir>/../../packages/kyc-react-native/__mocks__/react-native-webview.tsx',
    '^@react-native-community/netinfo$':
      '<rootDir>/../../packages/kyc-react-native/__mocks__/@react-native-community/netinfo.ts',
    '^react-native-safe-area-context$':
      '<rootDir>/__mocks__/react-native-safe-area-context.tsx',
  },
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
};
