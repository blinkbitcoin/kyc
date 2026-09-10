#!/usr/bin/env bash
# Boots the access-token example and calls its mutation for real. Default:
# the mock provider, no database, no Sumsub (make e2e-server-demos; CI: E2E /
# Server demos). PROVIDER=sumsub: the real provider with the SUMSUB_* values
# from the environment - the example mints a real access token (part of
# make e2e-live). Port: TOKEN_PORT (KYC_PORT_BASE + 3, table scripts/lib/ports.mjs).
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
up access-token-demo "http://127.0.0.1:$TOKEN_PORT/"

# access-token-demo: the mutation maps the tier and mints a token
BODY=$(curl -fsS "http://127.0.0.1:$TOKEN_PORT/" -H 'content-type: application/json' \
  -H 'authorization: Bearer smoke-user' \
  -d '{"query":"mutation { verificationAccessToken(platform: IOS, tier: \"basic\") { accessToken provider } }"}')
expect_match "access-token mutation ($PROVIDER)" "$TOKEN_PATTERN" "$BODY"
expect_match "access-token provider name" "\"provider\":\"$PROVIDER\"" "$BODY"
BODY=$(curl -fsS "http://127.0.0.1:$TOKEN_PORT/" -H 'content-type: application/json' \
  -d '{"query":"mutation { verificationAccessToken(platform: IOS, tier: \"basic\") { accessToken } }"}')
expect_match "access-token refuses anonymous" '"Unauthenticated"' "$BODY"
echo "server demos smoke: all ok ($PROVIDER)"
