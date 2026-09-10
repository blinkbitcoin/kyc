#!/usr/bin/env bash
# The web demo against the real Sumsub sandbox, in one command: the .env,
# a public URL for real webhooks, the backend, the web demo - then it waits
# so you can run docs/integration/sumsub.md section 5 in a browser, and
# tears everything down on Ctrl-C. Logs: $RUNNER_TEMP or /tmp (backend-live.log,
# web-live.log); the backend log shows every webhook outcome.
#   make live-web [VITE_KYC_MODE=proxy] [LIVE_PUBLIC_URL=https://...]
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/e2e/live-stack.sh
. scripts/e2e/live-stack.sh
live_env
trap live_down EXIT
trap 'exit 130' INT TERM # the EXIT trap tears down once
live_public_url
live_backend_up
echo "== web demo on :$KYC_WEB_PORT (${VITE_KYC_MODE:-hosted} mode)"
VITE_API_ORIGIN="http://localhost:$KYC_API_PORT" VITE_KYC_MODE="${VITE_KYC_MODE:-hosted}" \
  npm run web > "$LOG_DIR/web-live.log" 2>&1 &
wait_for web 40 2 "$LOG_DIR/web-live.log" http_ok "http://localhost:$KYC_WEB_PORT/"
echo
echo "open  http://localhost:$KYC_WEB_PORT   (docs/integration/sumsub.md, section 5)"
echo "logs  $LOG_DIR/backend-live.log (webhook outcomes)  $LOG_DIR/web-live.log"
echo "Ctrl-C tears it down (the funnel stays: tailscale funnel --https=443 off)"
wait
