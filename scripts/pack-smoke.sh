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
# Install core first so the platform packages resolve it from the local tarball
npm install --no-save ./blinkbitcoin-kyc-core-*.tgz >/dev/null
npm install --no-save ./blinkbitcoin-kyc-sumsub-*.tgz ./blinkbitcoin-kyc-react-native-*.tgz ./blinkbitcoin-kyc-react-*.tgz >/dev/null 2>&1 || true

node - <<'NODE'
const assert = require('node:assert');
const hosted = require('@blinkbitcoin/kyc-core/hosted');
assert.equal(typeof hosted.isLaunchable, 'function');
assert.equal(typeof hosted.isTokenRefreshable, 'function');
let apolloInstalled = false;
try { require.resolve('@apollo/client'); apolloInstalled = true; } catch {}
assert.equal(apolloInstalled, false, '@apollo/client must NOT be installed for hosted-only use');
const loaded = Object.keys(require.cache).filter((f) => /node_modules[\\/](@apollo|graphql)/.test(f));
assert.deepEqual(loaded, [], '/hosted must not load Apollo or graphql');
console.log('pack smoke: /hosted resolves Apollo-free');
NODE
NODE_OPTIONS="" node --input-type=module -e "
import { isLaunchable } from '@blinkbitcoin/kyc-core/hosted';
if (typeof isLaunchable !== 'function') process.exit(1);
console.log('pack smoke: ESM import of /hosted works');
"
echo "PACK SMOKE PASSED"
