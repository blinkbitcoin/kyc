#!/usr/bin/env bash
# The full live run against the real Sumsub sandbox, in one command: the
# configuration check, the E2E Postgres, the live tests (a real access
# token through the package and the service, the refresh, the status read,
# the hosted page for a real token, a webhook signed with the real secret),
# then the access-token example minting a real token, and the database
# down. Local (make e2e-live) and CI (the Live job) alike; no device, no
# browser - the device matrix in docs/integration/sumsub.md stays manual.
#   make e2e-live [TOKEN_PORT=5103]
set -euo pipefail
cd "$(dirname "$0")/../.."
SERVICE=examples/full-service-demo
ENV_FILE="${LIVE_ENV_FILE:-$SERVICE/.env}"

# Two ways in: the service's .env (make sumsub-env), or the SUMSUB_* values
# in the environment (CI: docs/operations/live-e2e-ci.md).
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
elif [ -z "${SUMSUB_APP_TOKEN:-}" ]; then
  echo "::error::no $ENV_FILE (make sumsub-env) and no SUMSUB_* in the environment"; exit 1
fi
: "${SUMSUB_SECRET_KEY:?}" "${SUMSUB_WEBHOOK_SECRET:?}"
export KYC_PROVIDER=sumsub ALLOW_INSECURE_DEV=true
unset JWT_SECRET # the bearer token is the user id (what the tests send)

echo "== sumsub check"
npm run --silent sumsub:check -w "$SERVICE"

# The service round trips persist sessions: the E2E Postgres (tmpfs, :5433)
echo "== test database"
trap 'make test-db-down > /dev/null 2>&1 || true' EXIT
make test-db-up > /dev/null
export DATABASE_URL="postgresql://test:test@localhost:5433/kyc_test"
npm run --silent migrate -w "$SERVICE" > /dev/null

echo "== live tests (token, status, hosted page, signed webhook)"
npm run --silent test:live -w "$SERVICE"

echo "== the access-token example mints a real token"
PROVIDER=sumsub TOKEN_PORT="${TOKEN_PORT:-5103}" bash scripts/e2e/server-demos-smoke.sh
echo "live run: all ok"
