const assert = require('node:assert');
const path = require('node:path');
const { createRequire } = require('node:module');

const consumer = createRequire(path.join(process.cwd(), 'package.json'));

const mode = process.argv[2];
if (mode === 'default') {
  const hosted = consumer('@blinkbitcoin/kyc-core/hosted');
  assert.equal(typeof hosted.isLaunchable, 'function');
  assert.equal(typeof hosted.isTokenRefreshable, 'function');
  assert.equal(typeof hosted.createHostedSource, 'function');
  assert.equal(typeof hosted.interpretBridgeMessage, 'function');
  const testing = consumer('@blinkbitcoin/kyc-core/testing');
  assert.equal(typeof testing.createFakeLaunchableSource, 'function');
  const loaded = Object.keys(require.cache).filter(f =>
    /node_modules[\\/](@apollo|graphql)/.test(f),
  );
  assert.deepEqual(
    loaded,
    [],
    '/hosted and /testing must not load Apollo or graphql',
  );
  console.log(
    'verify: /hosted + /testing load Apollo-free for',
    process.env.VERSION,
  );
} else if (mode === 'lean') {
  consumer('@blinkbitcoin/kyc-core/hosted');
  consumer('@blinkbitcoin/kyc-core/testing');
  let apollo = false;
  try {
    consumer.resolve('@apollo/client');
    apollo = true;
  } catch {}
  assert.equal(apollo, false, '--omit=peer install must not contain Apollo');
  console.log('verify: --omit=peer install is Apollo-free');
} else {
  console.error('usage: registry-smoke-assert.cjs <default|lean>');
  process.exit(2);
}
