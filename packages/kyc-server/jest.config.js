module.exports = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@blinkbitcoin/kyc-core/sumsub$': '<rootDir>/../kyc-core/src/sumsub.ts',
    '^@blinkbitcoin/kyc-core/hosted$': '<rootDir>/../kyc-core/src/hosted.ts',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/__tests__/support\\.ts$',
  ],
  // Only pure re-export barrels and test helpers are ignored; every module
  // with logic is covered at 100%.
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/index\\.ts$',
    'src/knex\\.ts$',
    'src/express\\.ts$',
    'src/sumsub\\.ts$',
    'src/providers/sumsub/index\\.ts$',
    'src/providers/mock/index\\.ts$',
    '/__tests__/support\\.ts$',
  ],
  // json-summary feeds scripts/coverage-badge.mjs (README badge + HTML report)
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
