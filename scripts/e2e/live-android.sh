#!/usr/bin/env bash
# The React Native demo on the attached Android device against the real
# Sumsub sandbox, in one command: the .env, a public URL, the backend, Metro
# carrying the mode, the debug APK for the device's ABI installed and
# launched - then it waits for docs/integration/sumsub.md sections 4
# (KYC_MODE=hosted) or 3 (KYC_MODE=native, needs the Sumsub SDK peer in the
# demo) and tears down on Ctrl-C. The device reaches Metro and the backend
# through `adb reverse` (USB), so KYC_API_HOST is localhost on the device;
# the hosted page itself loads from PUBLIC_BASE_URL (the funnel).
#   make live-android [KYC_MODE=hosted|native] [LIVE_DEVICE=<serial>]
# LIVE_DEVICE is the adb serial (adb devices); ANDROID_SERIAL, adb's own
# variable, is honoured too.
# A physical phone is the point (an emulator's virtual camera cannot do
# liveness); the script only warns on an emulator.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/e2e/live-stack.sh
. scripts/e2e/live-stack.sh
live_env
trap live_down EXIT
trap 'exit 130' INT TERM # the EXIT trap tears down once
adb get-state > /dev/null 2>&1 || { echo "::error::no Android device attached (adb devices) - plug the phone in with USB debugging on"; exit 1; }
SERIAL="${LIVE_DEVICE:-${ANDROID_SERIAL:-$(adb get-serialno)}}"
case "$SERIAL" in emulator-*) echo "::warning::$SERIAL is an emulator: its virtual camera cannot do liveness, the device rows need a physical phone";; esac
live_public_url
live_backend_up

KYC_MODE="${KYC_MODE:-hosted}"
[ "$KYC_MODE" != native ] || [ -d examples/react-native-demo/node_modules/@sumsub/react-native-mobilesdk-module ] || echo "::warning::KYC_MODE=native without the Sumsub SDK peer installed in the demo - the app will report SDK_UNAVAILABLE (docs/integration/sumsub.md, section 3)"

echo "== adb reverse (Metro 8081, backend $KYC_API_PORT) on $SERIAL"
adb -s "$SERIAL" reverse tcp:8081 tcp:8081
adb -s "$SERIAL" reverse "tcp:$KYC_API_PORT" "tcp:$KYC_API_PORT"

echo "== Metro ($KYC_MODE mode, backend at localhost:$KYC_API_PORT through adb reverse)"
if lsof -t -iTCP:8081 -sTCP:LISTEN > /dev/null 2>&1; then
  echo "::error::port 8081 is taken - stop that Metro first (its bundle would not carry KYC_MODE / KYC_API_HOST)"; exit 1
fi
( cd examples/react-native-demo && KYC_MODE="$KYC_MODE" KYC_API_HOST=localhost KYC_PORT_BASE="$KYC_PORT_BASE" npm start > "$LOG_DIR/metro-live.log" 2>&1 ) &
bash scripts/e2e/metro-wait.sh android

echo "== debug APK for $SERIAL, installed and launched"
ANDROID_ABI="$(adb -s "$SERIAL" shell getprop ro.product.cpu.abi | tr -d '\r')" bash scripts/e2e/android-build.sh > "$LOG_DIR/android-live.log" 2>&1 || { tail -30 "$LOG_DIR/android-live.log"; echo "::error::the APK build failed (full log: $LOG_DIR/android-live.log)"; exit 1; }
adb -s "$SERIAL" install -r examples/react-native-demo/android/app/build/outputs/apk/debug/app-debug.apk > /dev/null
adb -s "$SERIAL" shell am start -n com.reactnativesandbox/.MainActivity > /dev/null
echo
echo "app   running on $SERIAL ($KYC_MODE mode) - docs/integration/sumsub.md section $([ "$KYC_MODE" = native ] && echo 3 || echo 4)"
echo "logs  $LOG_DIR/backend-live.log (webhook outcomes)  $LOG_DIR/metro-live.log  adb logcat"
echo "Ctrl-C tears it down (the funnel stays: tailscale funnel --https=443 off)"
wait
