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
  const sumsub = consumer('@blinkbitcoin/kyc-core/sumsub');
  assert.equal(
    sumsub.mapSumsubStatus('completed', { reviewAnswer: 'GREEN' }),
    'approved',
  );
  const server = consumer('@blinkbitcoin/kyc-node');
  assert.equal(typeof server.createVerificationService, 'function');
  assert.equal(
    typeof consumer('@blinkbitcoin/kyc-node/knex').runKycMigrations,
    'function',
  );
  const loaded = Object.keys(require.cache).filter(f =>
    /node_modules[\\/](@apollo|graphql)/.test(f),
  );
  assert.deepEqual(
    loaded,
    [],
    '/hosted, /testing and /sumsub must not load Apollo or graphql',
  );
  console.log(
    'verify: /hosted + /testing + /sumsub load Apollo-free for',
    process.env.VERSION,
  );
} else if (mode === 'lean') {
  consumer('@blinkbitcoin/kyc-core/hosted');
  consumer('@blinkbitcoin/kyc-core/testing');
  consumer('@blinkbitcoin/kyc-node');
  let express = false;
  try {
    consumer.resolve('express');
    express = true;
  } catch {}
  assert.equal(express, false, '--omit=peer install must not contain express');
  let apollo = false;
  try {
    consumer.resolve('@apollo/client');
    apollo = true;
  } catch {}
  assert.equal(apollo, false, '--omit=peer install must not contain Apollo');
  console.log('verify: --omit=peer install is Apollo-free');
} else if (mode === 'server') {
  // The service's manifest pins the server at the published version and the
  // install resolved that pin to one shared copy of the same version
  const service = consumer('@blinkbitcoin/kyc-service/package.json');
  assert.equal(service.version, process.env.VERSION);
  assert.equal(
    service.dependencies['@blinkbitcoin/kyc-node'],
    process.env.VERSION,
    'the service must pin kyc-node at its own version',
  );
  const server = consumer('@blinkbitcoin/kyc-node/package.json');
  assert.equal(server.version, process.env.VERSION);
  console.log(
    'verify: the service installs over kyc-node',
    process.env.VERSION,
  );
} else {
  console.error('usage: registry-smoke-assert.cjs <default|lean|server>');
  process.exit(2);
}
