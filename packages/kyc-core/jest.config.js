module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Only pure re-export barrels are ignored; every module with logic is
  // covered at 100%.
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/generated/',
    'src/verification/index\\.ts$',
    'src/index\\.ts$',
    'src/hosted\\.ts$',
    'src/testing\\.ts$',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
