#!/usr/bin/env bash
# Writes examples/full-service-demo/.env for a live Sumsub run from the
# three secrets (App Token, its secret key, the webhook secret key) and the
# level name - docs/integration/sumsub.md, section 1.
#   make sumsub-env APP_TOKEN=… SECRET_KEY=… WEBHOOK_SECRET=… \
#        [LEVEL_NAME=basic-kyc-level] [PUBLIC_BASE_URL=http://localhost:5100] \
#        [WEBHOOK_DIGEST_ALG=HMAC_SHA256_HEX] [JWT_SECRET=…] [FORCE=1]
# Refuses to overwrite an existing .env unless FORCE=1. Local only, never CI
# (CI reads the same names from the sumsub-sandbox environment).
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${APP_TOKEN:?Sumsub app token}" "${SECRET_KEY:?the app-token secret key}" \
  "${WEBHOOK_SECRET:?the webhook secret key}"
OUT="${OUT:-examples/full-service-demo/.env}"
if [ -f "$OUT" ] && [ -z "${FORCE:-}" ]; then
  echo "$OUT exists - set FORCE=1 to overwrite"; exit 1
fi
{
  echo "# Written by make sumsub-env ($(date -u +%Y-%m-%dT%H:%M:%SZ)); local only, never commit"
  echo "PORT=${PORT:-5100}"
  echo "DATABASE_URL=${DATABASE_URL:-postgresql://dev:dev@localhost:5432/kyc}"
  # No JWT_SECRET unless asked: with ALLOW_INSECURE_DEV the bearer token is
  # the user id, which is what the live tests and the demos send.
  [ -n "${JWT_SECRET:-}" ] && echo "JWT_SECRET=$JWT_SECRET"
  echo "ALLOW_INSECURE_DEV=true"
  echo "KYC_PROVIDER=sumsub"
  echo "SUMSUB_APP_TOKEN=$APP_TOKEN"
  echo "SUMSUB_SECRET_KEY=$SECRET_KEY"
  echo "SUMSUB_WEBHOOK_SECRET=$WEBHOOK_SECRET"
  echo "SUMSUB_WEBHOOK_DIGEST_ALG=${WEBHOOK_DIGEST_ALG:-HMAC_SHA256_HEX}"
  echo "SUMSUB_LEVEL_NAME=${LEVEL_NAME:-basic-kyc-level}"
  echo "SUMSUB_BASE_URL=${SUMSUB_BASE_URL:-https://api.sumsub.com}"
  echo "PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-http://localhost:${PORT:-5100}}"
} > "$OUT"
chmod 600 "$OUT"
echo "wrote $OUT (level ${LEVEL_NAME:-basic-kyc-level})"
