#!/usr/bin/env bash
# Packs the four packages and installs them into a clean project, then
# asserts the consumer contract: the /hosted, /testing and /sumsub entries
# resolve and never load Apollo; the server package loads with no peers and
# reaches core Apollo-free; the platform packages expose their /sumsub entry. Run from the repo root after `npm run build` (CI: E2E / Build Packages).
set -euo pipefail
SMOKE="$(mktemp -d)"
trap 'rm -rf "$SMOKE"' EXIT

for p in packages/kyc-core packages/kyc-server packages/kyc-react-native packages/kyc-react; do
  (cd "$p" && npm pack --pack-destination "$SMOKE" >/dev/null)
done

# One tarball per package, resolved through the shell's own globbing: `ls` on
# an unquoted glob silently returns several paths (or the literal pattern
# when nothing matched) and hands npm a spec it cannot parse. The [0-9]
# anchors the version so kyc-react-* does not also catch kyc-react-native-*.
assert_one() {
  local name=$1
  shift
  if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
    echo "ERROR: expected exactly one $name tarball in $SMOKE, got: $*" >&2
    exit 1
  fi
}

CORE_TGZS=("$SMOKE"/blinkbitcoin-kyc-core-[0-9]*.tgz)
SERVER_TGZS=("$SMOKE"/blinkbitcoin-kyc-server-[0-9]*.tgz)
RN_TGZS=("$SMOKE"/blinkbitcoin-kyc-react-native-[0-9]*.tgz)
WEB_TGZS=("$SMOKE"/blinkbitcoin-kyc-react-[0-9]*.tgz)
assert_one kyc-core "${CORE_TGZS[@]}"
assert_one kyc-server "${SERVER_TGZS[@]}"
assert_one kyc-react-native "${RN_TGZS[@]}"
assert_one kyc-react "${WEB_TGZS[@]}"
CORE_TGZ="${CORE_TGZS[0]}"
SERVER_TGZ="${SERVER_TGZS[0]}"

cd "$SMOKE"
npm init -y >/dev/null
# The platform packages depend on kyc-core@0.0.0-development, a version that
# exists only in this workspace: the override points that spec at the packed
# core tarball so they install from disk, with no registry lookup. Declaring
# core as a package.json dependency (rather than passing the tarball as an
# `npm install` CLI target) avoids npm's EOVERRIDE check, which rejects an
# override that textually matches a *direct install target*'s spec.
npm pkg set "overrides.@blinkbitcoin/kyc-core=file:$CORE_TGZ" >/dev/null
npm pkg set "dependencies.@blinkbitcoin/kyc-core=file:$CORE_TGZ" >/dev/null
npm pkg set "dependencies.@blinkbitcoin/kyc-server=file:$SERVER_TGZ" >/dev/null
npm install --prefer-offline --no-audit >/dev/null
# The platform packages need their React peers; install them best-effort so
# their export maps can be checked (the RN library itself cannot run in Node)
npm install --no-save --prefer-offline --no-audit "${RN_TGZS[0]}" "${WEB_TGZS[0]}" >/dev/null 2>&1 || true

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
// The Sumsub entry: the mapping plus the hosted layer, still Apollo-free
const sumsub = require('@blinkbitcoin/kyc-core/sumsub');
assert.equal(typeof sumsub.mapSumsubStatus, 'function');
assert.equal(typeof sumsub.mapSumsubWebhookStatus, 'function');
assert.equal(typeof sumsub.interpretSumsubWebMessage, 'function');
assert.equal(sumsub.mapSumsubStatus('completed', { reviewAnswer: 'GREEN' }), 'approved');
// The hosted layer rides along (each CJS entry carries its own bundle, so
// compare shape, not identity)
assert.equal(typeof sumsub.createHostedSource, 'function');
assert.equal(typeof sumsub.isLaunchable, 'function');
let apolloInstalled = false;
try { require.resolve('@apollo/client'); apolloInstalled = true; } catch {}
assert.equal(apolloInstalled, false, '@apollo/client must NOT be installed for hosted-only use');
const loaded = Object.keys(require.cache).filter((f) => /node_modules[\\/](@apollo|graphql)/.test(f));
assert.deepEqual(loaded, [], '/hosted, /testing and /sumsub must not load Apollo or graphql');
// The server package: framework-free root and Sumsub entry load with no
// peers installed, the Knex store needs knex only for its types, the
// router needs express (an optional peer) - and none of it reaches Apollo
const server = require('@blinkbitcoin/kyc-server');
assert.equal(typeof server.createVerificationService, 'function');
assert.equal(typeof server.providerFromEnv, 'function');
assert.equal(typeof server.createKycGraphQL, 'function');
assert.equal(typeof server.typeDefs, 'string');
const serverKnex = require('@blinkbitcoin/kyc-server/knex');
assert.equal(typeof serverKnex.createKnexSessionStore, 'function');
assert.equal(typeof serverKnex.runKycMigrations, 'function');
const serverSumsub = require('@blinkbitcoin/kyc-server/sumsub');
assert.equal(typeof serverSumsub.createSumsubProvider, 'function');
assert.equal(serverSumsub.sumsubHostedPage.render({ sessionId: 's', userId: 'u', accessToken: 't', nonce: 'n' }).includes('snsWebSdk'), true);
let expressLoaded = false;
try { require('@blinkbitcoin/kyc-server/express'); expressLoaded = true; } catch {}
assert.equal(expressLoaded, false, '/express must need the express peer');
const afterServer = Object.keys(require.cache).filter((f) => /node_modules[\\/](@apollo|graphql)/.test(f));
assert.deepEqual(afterServer, [], 'the server package must not load Apollo or graphql');
// The FULL core entry needs the optional Apollo peers - without them
// installed it must fail loudly at require-time (that boundary is the reason
// /hosted exists). If this ever starts succeeding, the optional-peer contract broke.
let fullLoaded = false;
try { require('@blinkbitcoin/kyc-core'); fullLoaded = true; } catch {}
assert.equal(fullLoaded, false, 'full entry must require the Apollo peers');
// The platform packages' /sumsub entries resolve through their export maps
const resolvable = (name) => { try { require.resolve(`${name}/package.json`); return true; } catch { return false; } };
if (resolvable('@blinkbitcoin/kyc-react-native')) {
  assert.match(require.resolve('@blinkbitcoin/kyc-react-native/sumsub'), /lib[\\/]commonjs[\\/]sumsub\.js$/);
  const rnDir = require('node:path').dirname(require.resolve('@blinkbitcoin/kyc-react-native/package.json'));
  assert.ok(require('node:fs').existsSync(`${rnDir}/__mocks__/@sumsub/react-native-mobilesdk-module.ts`), 'the Sumsub SDK test double ships with the RN package');
}
if (resolvable('@blinkbitcoin/kyc-react')) {
  assert.match(require.resolve('@blinkbitcoin/kyc-react/sumsub'), /dist[\\/]sumsub\.cjs$/);
}
console.log('pack smoke: /hosted + /testing + /sumsub and the server package resolve Apollo-free; full entry correctly needs Apollo');
NODE
NODE_OPTIONS="" node --input-type=module -e "
import { createHostedSource } from '@blinkbitcoin/kyc-core/hosted';
import { mapSumsubStatus } from '@blinkbitcoin/kyc-core/sumsub';
import { createVerificationService } from '@blinkbitcoin/kyc-server';
if (typeof createHostedSource !== 'function') process.exit(1);
if (typeof createVerificationService !== 'function') process.exit(1);
if (mapSumsubStatus('completed', { reviewAnswer: 'GREEN' }) !== 'approved') process.exit(1);
console.log('pack smoke: ESM imports of /hosted and /sumsub work');
"
echo "PACK SMOKE PASSED"
