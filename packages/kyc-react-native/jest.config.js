module.exports = {
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/', '/lib/'],
  // The built package carries a copy of __mocks__; without this, jest-haste-map
  // sees two manual mocks with the same name and warns on every run.
  modulePathIgnorePatterns: ['<rootDir>/lib/'],
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core/hosted$': '<rootDir>/../kyc-core/src/hosted.ts',
    '^@blinkbitcoin/kyc-core$': '<rootDir>/../kyc-core/src/index.ts',
    '^react-native-webview$': '<rootDir>/__mocks__/react-native-webview.tsx',
    '^@react-native-community/netinfo$':
      '<rootDir>/__mocks__/@react-native-community/netinfo.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@apollo/client|graphql|react-native-webview)/)',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__mocks__/',
    'src/generated/',
    'src/types\\.ts$',
    'src/index\\.ts$',
    'src/hosted\\.ts$',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
