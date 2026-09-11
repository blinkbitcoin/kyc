#!/usr/bin/env bash
# The full live run against the real Sumsub sandbox, in one command: the
# configuration check, the E2E Postgres, the live tests (a real access
# token through the package and the service, the refresh, the status read,
# the hosted page for a real token, a webhook signed with the real secret;
# then real applicants: a document upload, the check, GREEN / RED-RETRY /
# RED-FINAL reviews walking sessions to approved / declined /
# finallyRejected), then the access-token example minting a real token, and
# the database down. Local (make e2e-live) and CI (the Live job) alike; no
# device, no browser - the camera rows in docs/integration/sumsub.md stay
# manual. With PUBLIC_BASE_URL reachable from the internet (the funnel,
# scripts/e2e/live-stack.sh) the real review webhooks arrive too; without
# it the status reads reconcile against Sumsub.
#   make e2e-live [TOKEN_PORT=…]  (ports: KYC_PORT_BASE + offset, scripts/lib/ports.mjs)
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/e2e/ports-env.sh
. scripts/e2e/ports-env.sh
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

# The service round trips persist sessions: the E2E Postgres (tmpfs, on
# KYC_TEST_DB_PORT)
echo "== test database"
trap 'make test-db-down > /dev/null 2>&1 || true' EXIT
make test-db-up > /dev/null
export DATABASE_URL="$KYC_TEST_DATABASE_URL"
npm run --silent migrate -w "$SERVICE" > /dev/null

echo "== live tests (token, status, hosted page, signed webhook; real applicants on ${SUMSUB_E2E_LEVEL_NAME:-${SUMSUB_LEVEL_NAME:-basic-kyc-level}})"
npm run --silent test:live -w "$SERVICE"

echo "== the access-token example mints a real token"
PROVIDER=sumsub bash scripts/e2e/server-demos-smoke.sh
echo "live run: all ok"
