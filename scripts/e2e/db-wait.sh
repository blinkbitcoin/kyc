#!/usr/bin/env bash
# Waits for the E2E Postgres (docker-compose.test.yml) to accept connections.
# `docker compose up --wait` already blocks on the healthcheck; this is the
# explicit pg_isready confirmation the backend suite relied on.
set -euo pipefail
# shellcheck source=scripts/e2e/wait-lib.sh
. "$(dirname "$0")/wait-lib.sh"
cd "$(dirname "$0")/../.."
# -h forces a TCP check (the Unix socket is ready before the listener is).
wait_for database 30 2 "" docker compose -f docker-compose.test.yml exec -T postgres-test \
  pg_isready -h 127.0.0.1 -p 5432 -U test -d kyc_test
