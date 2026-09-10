#!/usr/bin/env bash
# The whole Android E2E stack on a laptop, in one command, torn down on the
# way out whatever happens: E2E Postgres + migrations, the backend (mock
# provider) on KYC_API_PORT, the debug APK for the attached emulator, Metro
# in hosted mode, the Maestro suite. Needs: an emulator already running
# (`emulator -avd <name> &`), Maestro installed. CI runs the same steps as
# separate jobs (e2e.yml).
#   make e2e-android-local
set -euo pipefail
cd "$(dirname "$0")/../.."
adb get-state > /dev/null 2>&1 || { echo "::error::no emulator attached - start one first (emulator -list-avds; emulator -avd <name> &)"; exit 1; }
command -v maestro > /dev/null 2>&1 || [ -x "$HOME/.maestro/bin/maestro" ] || { echo "::error::maestro is not installed: curl -Ls https://get.maestro.mobile.dev | bash"; exit 1; }

down() {
  echo "== teardown"
  bash scripts/e2e/metro-down.sh
  bash scripts/e2e/backend-down.sh
  make test-db-down > /dev/null 2>&1 || true
}
trap down EXIT

echo "== test database"
make test-db-up > /dev/null
npm run --silent migrate:test -w examples/full-service-demo > /dev/null
echo "== backend (mock provider) on :${KYC_API_PORT:-5100}"
bash scripts/e2e/backend-up.sh
echo "== debug APK"
bash scripts/e2e/android-build.sh
echo "== Metro (hosted mode)"
bash scripts/e2e/metro-start.sh
bash scripts/e2e/metro-wait.sh android
echo "== Maestro"
bash scripts/e2e/android-maestro.sh
echo "android e2e: all ok"
