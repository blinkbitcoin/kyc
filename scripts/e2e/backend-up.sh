#!/usr/bin/env bash
# Starts the backend with the mock provider in the background and waits for
# /health. Needs the E2E Postgres up + migrated (make test-db-up; npm run
# migrate:test -w packages/kyc-service). Log: $RUNNER_TEMP/backend.log (or /tmp).
# Ports: KYC_API_PORT (KYC_PORT_BASE + 0, table scripts/lib/ports.mjs) - the
# hosted-page URLs are minted on it too - and the E2E database on
# KYC_TEST_DB_PORT (exported over .env.test's default URL).
# CI: E2E / iOS + Android. Local: make e2e-backend-up.
set -euo pipefail
# shellcheck source=scripts/e2e/wait-lib.sh
. "$(dirname "$0")/wait-lib.sh"
# shellcheck source=scripts/e2e/ports-env.sh
. "$(dirname "$0")/ports-env.sh"
cd "$(dirname "$0")/../../packages/kyc-service"
LOG="${RUNNER_TEMP:-/tmp}/backend.log"
API_PORT="$KYC_API_PORT"
PORT="$API_PORT" PUBLIC_BASE_URL="http://localhost:$API_PORT" KYC_PROVIDER=mock \
  DATABASE_URL="$KYC_TEST_DATABASE_URL" \
  npx dotenv-cli -e .env.test -- npm run dev > "$LOG" 2>&1 &
wait_for backend 30 2 "$LOG" http_ok "http://localhost:$API_PORT/health"
