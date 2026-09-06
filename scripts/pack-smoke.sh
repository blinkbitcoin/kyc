#!/usr/bin/env bash
# Packs the four packages and installs them into a clean project, then
# asserts the consumer contract: the /hosted entry resolves and never loads
# Apollo. Run from the repo root (CI: Tests / Unit / Packages job).
set -euo pipefail
SMOKE="$(mktemp -d)"
trap 'rm -rf "$SMOKE"' EXIT

for p in packages/kyc-core packages/kyc-sumsub packages/kyc-react-native packages/kyc-react; do
  (cd "$p" && npm pack --pack-destination "$SMOKE" >/dev/null)
done

cd "$SMOKE"
npm init -y >/dev/null
CORE_TGZ="$(ls "$SMOKE"/blinkbitcoin-kyc-core-*.tgz)"
SUMSUB_TGZ="$(ls "$SMOKE"/blinkbitcoin-kyc-sumsub-*.tgz)"
# kyc-sumsub depends on kyc-core@0.0.0-development, a version that exists only
# in this workspace: the override points that spec at the packed core tarball
# so the pair installs from disk, with no registry lookup. Declaring both as
# package.json dependencies (rather than passing the tarballs as `npm
# install` CLI targets) avoids npm's EOVERRIDE check, which rejects an
# override that textually matches a *direct install target*'s spec.
npm pkg set "overrides.@blinkbitcoin/kyc-core=file:$CORE_TGZ" >/dev/null
npm pkg set "dependencies.@blinkbitcoin/kyc-core=file:$CORE_TGZ" >/dev/null
npm pkg set "dependencies.@blinkbitcoin/kyc-sumsub=file:$SUMSUB_TGZ" >/dev/null
npm install >/dev/null
npm install --no-save ./blinkbitcoin-kyc-react-native-*.tgz ./blinkbitcoin-kyc-react-*.tgz >/dev/null 2>&1 || true

node - <<'NODE'
const assert = require('node:assert');
const hosted = require('@blinkbitcoin/kyc-core/hosted');
assert.equal(typeof hosted.isLaunchable, 'function');
assert.equal(typeof hosted.isTokenRefreshable, 'function');
assert.equal(typeof hosted.createHostedSource, 'function');
assert.equal(typeof hosted.interpretBridgeMessage, 'function');
assert.equal(typeof hosted.getErrorMessage, 'function');
const testing = require('@blinkbitcoin/kyc-core/testing');
assert.equal(typeof testing.createFakeLaunchableSource, 'function');
let apolloInstalled = false;
try { require.resolve('@apollo/client'); apolloInstalled = true; } catch {}
assert.equal(apolloInstalled, false, '@apollo/client must NOT be installed for hosted-only use');
const loaded = Object.keys(require.cache).filter((f) => /node_modules[\\/](@apollo|graphql)/.test(f));
assert.deepEqual(loaded, [], '/hosted and /testing must not load Apollo or graphql');
// The FULL entry needs the optional Apollo peers - without them installed it
// must fail loudly at require-time (that boundary is the reason /hosted
// exists). If this ever starts succeeding, the optional-peer contract broke.
let fullLoaded = false;
try { require('@blinkbitcoin/kyc-core'); fullLoaded = true; } catch {}
assert.equal(fullLoaded, false, 'full entry must require the Apollo peers');
const sumsub = require('@blinkbitcoin/kyc-sumsub');
assert.equal(typeof sumsub.mapSumsubStatus, 'function');
assert.equal(typeof sumsub.mapSumsubWebhookStatus, 'function');
assert.equal(typeof sumsub.interpretSumsubWebMessage, 'function');
assert.equal(sumsub.mapSumsubStatus('completed', { reviewAnswer: 'GREEN' }), 'approved');
const afterSumsub = Object.keys(require.cache).filter((f) => /node_modules[\\/](@apollo|graphql)/.test(f));
assert.deepEqual(afterSumsub, [], 'the sumsub root entry must not load Apollo or graphql');
console.log('pack smoke: /hosted + /testing + kyc-sumsub resolve Apollo-free; full entry correctly needs Apollo');
NODE
NODE_OPTIONS="" node --input-type=module -e "
import { createHostedSource } from '@blinkbitcoin/kyc-core/hosted';
if (typeof createHostedSource !== 'function') process.exit(1);
console.log('pack smoke: ESM import of /hosted works');
"
echo "PACK SMOKE PASSED"
