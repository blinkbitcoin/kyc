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
        'demo', // examples/*
        'e2e',
        'ci',
        'deps',
        'deps-dev',
        'docs',
        'release',
        // Retired scopes, still in history: the reference backend was
        // `api` before it became examples/full-service-demo on kyc-server,
        // and the Sumsub package was `sumsub` before the provider fold.
        // The PR range that carries that history must still lint clean.
        'api',
        'sumsub',
      ],
    ],
    // Dependabot group titles and imperative subjects run long; keep the
    // conventional default but allow a little slack over 72.
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 100],
  },
};
