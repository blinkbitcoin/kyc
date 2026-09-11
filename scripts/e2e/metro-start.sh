#!/usr/bin/env bash
# Starts Metro for the React Native demo in the background so its boot
# overlaps the rest of the setup; metro-wait.sh awaits it. Log:
# $RUNNER_TEMP/metro.log (or /tmp).
#
# KYC_MODE defaults to 'hosted' because the default Maestro suite
# (test:e2e / test:e2e:android) is bundled expecting the hosted source - the
# bundle-time mode this Metro serves MUST match whatever suite the caller is
# about to run. The fake-native job overrides it (KYC_MODE=fake-native) when
# it calls this script.
#
# METRO_CACHE_ROOT (CI's iOS job): Metro keeps its transform cache in
# $TMPDIR/metro-cache, so pointing TMPDIR at a directory actions/cache
# persists across runs turns the bundle prewarm from a full cold transform
# into a cache read. Only Metro's process tree sees the override; unset (a
# laptop, the Android job) leaves the OS temp dir alone.
set -euo pipefail
cd "$(dirname "$0")/../../examples/react-native-demo"
if [ -n "${METRO_CACHE_ROOT:-}" ]; then
  mkdir -p "$METRO_CACHE_ROOT"
  export TMPDIR="$METRO_CACHE_ROOT"
fi
KYC_MODE="${KYC_MODE:-hosted}" npm start > "${RUNNER_TEMP:-/tmp}/metro.log" 2>&1 &
echo "Metro starting (pid $!)"
