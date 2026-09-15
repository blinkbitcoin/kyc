#!/usr/bin/env bash
# Boots the two in-process server examples and calls their routes for real:
# the access-token example's mutation and the serverless handler's endpoint.
# Default: the mock provider, no database, no Sumsub (make e2e-server-demos;
# CI: E2E / Server demos). PROVIDER=sumsub: the real provider with the
# SUMSUB_* values from the environment - both mint a real access token (part
# of make e2e-live). Ports: TOKEN_PORT (KYC_PORT_BASE + 3) and HANDLER_PORT
# (KYC_PORT_BASE + 6), table scripts/lib/ports.mjs.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/e2e/wait-lib.sh
. scripts/e2e/wait-lib.sh
# shellcheck source=scripts/e2e/ports-env.sh
. scripts/e2e/ports-env.sh
LOG_DIR="${RUNNER_TEMP:-/tmp}"
PROVIDER="${PROVIDER:-mock}"
if [ "$PROVIDER" = sumsub ]; then
  : "${SUMSUB_APP_TOKEN:?}" "${SUMSUB_SECRET_KEY:?}"
  # Both of the example's tiers mint on the sandbox's configured levels.
  # Derived here rather than inherited: live.sh sources the service's .env
  # with `set -a`, so locally these arrive whether or not anyone passes them,
  # while the CI job exports only the SUMSUB_* values. A tier left to its
  # repo default would then be green locally and a Sumsub 4xx in CI - the
  # first live run against Blink's sandbox already hit exactly that
  # (examples/access-token-demo/src/level.ts).
  export KYC_LEVEL_BASIC="${KYC_LEVEL_BASIC:-${SUMSUB_LEVEL_NAME:-basic-kyc-level}}"
  # Both tiers fall back to the one level this sandbox is known to have
  # (SUMSUB_LEVEL_NAME). Not SUMSUB_E2E_LEVEL_NAME - that is the
  # document-only level the submission tests create applicants on, a
  # different job. What the smoke needs is a level that exists.
  export KYC_LEVEL_ENHANCED="${KYC_LEVEL_ENHANCED:-${SUMSUB_LEVEL_NAME:-enhanced-kyc-level}}"
  TOKEN_PATTERN='"accessToken":"[^"]+"'
else
  TOKEN_PATTERN='"accessToken":"mock-token-'
fi
PIDS=()
cleanup() { for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT

start() { # <workspace> <port>
  KYC_PROVIDER="$PROVIDER" PORT="$2" npm run dev -w "examples/$1" > "$LOG_DIR/$1.log" 2>&1 &
  PIDS+=($!)
}
up() { # <name> <url> - the demo answers (2xx, or 4xx from a route that exists)
  wait_for "$1" 30 1 "$LOG_DIR/$1.log" http_answers "$2"
}
expect_match() { # <label> <pattern> <body>
  if printf '%s' "$3" | grep -Eq "$2"; then echo "server demos smoke: $1 ok"; else
    echo "::error::$1: expected /$2/ in: $3"; exit 1; fi
}

start access-token-demo "$TOKEN_PORT"
start serverless-handler-demo "$HANDLER_PORT"
up access-token-demo "http://127.0.0.1:$TOKEN_PORT/"
up serverless-handler-demo "http://127.0.0.1:$HANDLER_PORT/health"

# access-token-demo: the mutation maps the tier and mints a token
BODY=$(curl -fsS "http://127.0.0.1:$TOKEN_PORT/" -H 'content-type: application/json' \
  -H 'authorization: Bearer smoke-user' \
  -d '{"query":"mutation { verificationAccessToken(platform: IOS, tier: \"basic\") { accessToken provider } }"}')
expect_match "access-token mutation ($PROVIDER)" "$TOKEN_PATTERN" "$BODY"
expect_match "access-token provider name" "\"provider\":\"$PROVIDER\"" "$BODY"
BODY=$(curl -fsS "http://127.0.0.1:$TOKEN_PORT/" -H 'content-type: application/json' \
  -d '{"query":"mutation { verificationAccessToken(platform: IOS, tier: \"basic\") { accessToken } }"}')
expect_match "access-token refuses anonymous" '"Unauthenticated"' "$BODY"

# serverless-handler-demo: the access-token preset behind plain Node
BODY=$(curl -fsS -X POST "http://127.0.0.1:$HANDLER_PORT/verification/token" \
  -H 'content-type: application/json' -H 'authorization: Bearer smoke-user' \
  -d '{"platform":"IOS"}')
expect_match "serverless handler mint ($PROVIDER)" "$TOKEN_PATTERN" "$BODY"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$HANDLER_PORT/verification/token" \
  -H 'content-type: application/json' -d '{"platform":"IOS"}')
expect_match "serverless handler refuses anonymous" '^401$' "$STATUS"
echo "server demos smoke: all ok ($PROVIDER)"
