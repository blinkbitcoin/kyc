#!/usr/bin/env bash
# Sourced by live-web.sh and live-ios.sh: the real-Sumsub stack on a laptop.
# Defines
#   live_env        load packages/kyc-service/.env (make sumsub-env, or the
#                   committed .env.sumsub.example + the secrets) and export it
#   live_public_url PUBLIC_BASE_URL for real webhooks: LIVE_PUBLIC_URL if set,
#                   else a Tailscale Funnel on the backend port (started here,
#                   left running: `tailscale funnel --https=443 off` stops it),
#                   else the .env value with a warning
#   live_backend_up dev Postgres + migrations + the backend on KYC_PROVIDER=sumsub,
#                   PUBLIC_BASE_URL and CORS for the web demo, waits for /health
#   live_down       stop what live_*_up started (trap it on EXIT)
# Ports: scripts/lib/ports.mjs (KYC_PORT_BASE + offsets).
SERVICE=packages/kyc-service
LOG_DIR="${RUNNER_TEMP:-/tmp}"
# shellcheck source=scripts/e2e/wait-lib.sh
. scripts/e2e/wait-lib.sh
# shellcheck source=scripts/e2e/ports-env.sh
. scripts/e2e/ports-env.sh

live_env() {
  local env_file="${LIVE_ENV_FILE:-$SERVICE/.env}"
  [ -f "$env_file" ] || { echo "::error::no $env_file - cp $SERVICE/.env.sumsub.example $env_file and fill in the three secrets (or make sumsub-env ...)"; exit 1; }
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  : "${SUMSUB_APP_TOKEN:?}" "${SUMSUB_SECRET_KEY:?}" "${SUMSUB_WEBHOOK_SECRET:?}"
  export KYC_PROVIDER=sumsub ALLOW_INSECURE_DEV=true
  unset JWT_SECRET # the bearer token is the user id (what the demos send)
}

# The funnel hostname from `tailscale status --json` (trailing dot stripped),
# empty when Tailscale is absent or logged out
funnel_host() {
  command -v tailscale > /dev/null 2>&1 || return 0
  tailscale status --json 2> /dev/null | jq -r '.Self.DNSName // empty' | sed 's/\.$//'
}

live_public_url() {
  if [ -n "${LIVE_PUBLIC_URL:-}" ]; then
    PUBLIC_BASE_URL="$LIVE_PUBLIC_URL"
  else
    local host
    host=$(funnel_host)
    if [ -n "$host" ] && tailscale funnel --bg "$KYC_API_PORT" > "$LOG_DIR/funnel.log" 2>&1; then
      PUBLIC_BASE_URL="https://$host"
    else
      echo "::warning::no Tailscale Funnel (logged out, or Funnel not enabled on the tailnet) - keeping PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-unset}; real webhooks will not arrive"
    fi
  fi
  export PUBLIC_BASE_URL
  echo "== public URL $PUBLIC_BASE_URL (register $PUBLIC_BASE_URL/webhook/kyc/sumsub as the sandbox webhook target once)"
}

live_backend_up() {
  echo "== dev database + migrations"
  make db-up > /dev/null
  npm run --silent migrate -w "$SERVICE" > /dev/null
  export CORS_ALLOWED_ORIGINS="http://localhost:$KYC_WEB_PORT,${CORS_ALLOWED_ORIGINS:-}"
  echo "== backend on :$KYC_API_PORT (Sumsub sandbox, level $SUMSUB_LEVEL_NAME)"
  if lsof -t -iTCP:"$KYC_API_PORT" -sTCP:LISTEN > /dev/null 2>&1; then
    echo "::error::port $KYC_API_PORT is taken - stop that backend first (make e2e-backend-down)"; exit 1
  fi
  PORT="$KYC_API_PORT" npm run backend > "$LOG_DIR/backend-live.log" 2>&1 &
  wait_for backend 40 2 "$LOG_DIR/backend-live.log" http_ok "http://localhost:$KYC_API_PORT/health"
}

live_down() {
  echo "== teardown"
  bash scripts/e2e/backend-down.sh
  lsof -t -iTCP:"$KYC_WEB_PORT" -sTCP:LISTEN 2> /dev/null | xargs kill 2> /dev/null || true
  bash scripts/e2e/metro-down.sh
  make db-down > /dev/null 2>&1 || true
}
