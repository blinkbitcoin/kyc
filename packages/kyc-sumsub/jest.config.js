module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core/hosted$': '<rootDir>/../kyc-core/src/hosted.ts',
    '^@blinkbitcoin/kyc-core$': '<rootDir>/../kyc-core/src/index.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    // Test double shared with the RN demo, not shipped code.
    '/__mocks__/',
    'src/index\\.ts$',
    'src/react-native\\.ts$',
    'src/web\\.ts$',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
