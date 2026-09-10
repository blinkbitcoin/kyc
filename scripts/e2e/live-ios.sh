#!/usr/bin/env bash
# The React Native demo on a physical iPhone against the real Sumsub sandbox,
# in one command: the .env, a public URL, the backend, Metro carrying the
# mode and the Mac's tailnet address (KYC_API_HOST), the app built and
# launched on the attached phone - then it waits for docs/integration/sumsub.md
# sections 4 (KYC_MODE=hosted) or 3 (KYC_MODE=native, needs the Sumsub SDK
# peer installed in the demo) and tears down on Ctrl-C.
#   make live-ios [KYC_MODE=hosted|native] [IOS_DEVICE="<name>"] [KYC_API_HOST=<ip>]
# First time on a phone: pick the signing team for ReactNativeSandbox in Xcode.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/e2e/live-stack.sh
. scripts/e2e/live-stack.sh
# shellcheck source=scripts/e2e/xcode-env.sh
. scripts/e2e/xcode-env.sh
live_env
trap live_down EXIT
trap 'exit 130' INT TERM # the EXIT trap tears down once
live_public_url
live_backend_up

# The phone reaches the Mac over the tailnet (else give KYC_API_HOST=<LAN ip>)
KYC_API_HOST="${KYC_API_HOST:-$(tailscale ip -4 2> /dev/null | head -1)}"
[ -n "$KYC_API_HOST" ] || { echo "::error::KYC_API_HOST: no tailnet address - pass the Mac's LAN ip"; exit 1; }
# The first attached physical iPhone unless IOS_DEVICE names one
IOS_DEVICE="${IOS_DEVICE:-$(/usr/bin/xcrun xctrace list devices 2> /dev/null | grep -E '^[^=].*\(' | grep -viE 'simulator|macbook|mac |ipad' | head -1 | sed -E 's/ \([^)]*\)( \([^)]*\))?$//')}"
[ -n "$IOS_DEVICE" ] || { echo "::error::no iPhone attached (xcrun xctrace list devices)"; exit 1; }
KYC_MODE="${KYC_MODE:-hosted}"
[ "$KYC_MODE" != native ] || [ -d examples/react-native-demo/node_modules/@sumsub/react-native-mobilesdk-module ] || echo "::warning::KYC_MODE=native without the Sumsub SDK peer installed in the demo - the app will report SDK_UNAVAILABLE (docs/integration/sumsub.md, section 3)"

echo "== Metro ($KYC_MODE mode, backend at $KYC_API_HOST:$KYC_API_PORT)"
if lsof -t -iTCP:8081 -sTCP:LISTEN > /dev/null 2>&1; then
  echo "::error::port 8081 is taken - stop that Metro first (its bundle would not carry KYC_MODE / KYC_API_HOST)"; exit 1
fi
( cd examples/react-native-demo && KYC_MODE="$KYC_MODE" KYC_API_HOST="$KYC_API_HOST" KYC_PORT_BASE="$KYC_PORT_BASE" npm start > "$LOG_DIR/metro-live.log" 2>&1 ) &
bash scripts/e2e/metro-wait.sh ios

echo "== build + launch on \"$IOS_DEVICE\""
( cd examples/react-native-demo && KYC_MODE="$KYC_MODE" KYC_API_HOST="$KYC_API_HOST" npm run ios -- --device "$IOS_DEVICE" > "$LOG_DIR/ios-live.log" 2>&1 ) || { tail -30 "$LOG_DIR/ios-live.log"; echo "::error::the device build failed (full log: $LOG_DIR/ios-live.log; first time: select the signing team in Xcode)"; exit 1; }
echo
echo "app   running on \"$IOS_DEVICE\" ($KYC_MODE mode) - docs/integration/sumsub.md section $([ "$KYC_MODE" = native ] && echo 3 || echo 4)"
echo "logs  $LOG_DIR/backend-live.log (webhook outcomes)  $LOG_DIR/metro-live.log  $LOG_DIR/ios-live.log"
echo "Ctrl-C tears it down (the funnel stays: tailscale funnel --https=443 off)"
wait
