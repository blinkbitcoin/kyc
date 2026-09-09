export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'core', // packages/kyc-core
        'server', // packages/kyc-server
        'rn', // packages/kyc-react-native
        'react', // packages/kyc-react
        'sumsub', // packages/kyc-sumsub
        'api', // apps/api
        'demo', // examples/*
        'e2e',
        'ci',
        'deps',
        'deps-dev',
        'docs',
        'release',
      ],
    ],
    // Dependabot group titles and imperative subjects run long; keep the
    // conventional default but allow a little slack over 72.
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 100],
  },
};
