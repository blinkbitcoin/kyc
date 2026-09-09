// The workspaces a release stamp must touch. Publishing stamps VERSION into
// the published packages; every workspace that depends on one of them by
// version must be stamped to the same VERSION, or `npm ci` from a clean
// checkout of that workspace asks the registry for a version that does not
// exist. Guarded by workspaces.test.mjs, which compares this table with the
// manifests.

/** The packages that get a version stamp. */
export const PUBLISHED_PACKAGES = [
  'packages/kyc-core',
  'packages/kyc-server',
  'packages/kyc-react-native',
  'packages/kyc-react',
];

/**
 * Workspace directory → the published packages it depends on by version.
 * Devtools-only workspaces (scripts) and workspaces without an internal
 * dependency are absent.
 */
export const INTERNAL_DEPENDENCIES = {
  'packages/kyc-server': ['@blinkbitcoin/kyc-core'],
  'packages/kyc-react-native': ['@blinkbitcoin/kyc-core'],
  'packages/kyc-react': ['@blinkbitcoin/kyc-core'],
  'apps/api': ['@blinkbitcoin/kyc-core'],
  'examples/react-demo': ['@blinkbitcoin/kyc-react'],
  'examples/react-native-demo': ['@blinkbitcoin/kyc-react-native'],
};

/** The `npm pkg set` arguments that stamp `version` into every dependent. */
export const dependencyStamps = (version, edges = INTERNAL_DEPENDENCIES) =>
  Object.entries(edges).flatMap(([dir, deps]) =>
    deps.map(name => ({
      dir,
      args: ['pkg', 'set', `dependencies.${name}=${version}`],
    })),
  );
