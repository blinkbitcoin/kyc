module.exports = {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core/sumsub$': '<rootDir>/../kyc-core/src/sumsub.ts',
    '^@blinkbitcoin/kyc-core$': '<rootDir>/../kyc-core/src/index.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/generated/',
    'src/types\\.ts$',
    'src/index\\.ts$',
    'src/sumsub\\.ts$',
    'src/providers/sumsub/entry\\.ts$',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
