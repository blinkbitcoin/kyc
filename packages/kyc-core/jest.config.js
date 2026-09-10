module.exports = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'node',
  // __tests__/support/ holds the import-graph walker the guard tests share
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/__tests__/support/'],
  // Only pure re-export barrels are ignored; every module with logic is
  // covered at 100%.
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
    'src/generated/',
    'src/verification/index\\.ts$',
    'src/providers/sumsub/index\\.ts$',
    'src/providers/sumsub/entry\\.ts$',
    'src/index\\.ts$',
    'src/hosted\\.ts$',
    'src/testing\\.ts$',
    'src/sumsub\\.ts$',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
