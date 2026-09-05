#!/usr/bin/env bash
# Maestro E2E on the iOS simulator: per-flow retries plus one suite-level
# retry (a 124 timeout from maestro-bound.sh is not retried). Needs: app
# installed on a booted simulator, Metro + backend running.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE/../.." || exit 1
export PATH="$HOME/.maestro/bin:$PATH"
# shellcheck source=scripts/e2e/maestro-bound.sh
. "$HERE/maestro-bound.sh"
# Bounded per attempt (see maestro-bound.sh); a hung driver is not retried -
# the second attempt would only run into the step's timeout-minutes.
bounded_maestro test:e2e || {
  status=$?
  [ "$status" -eq 124 ] && exit "$status"
  echo "::warning::Maestro suite failed after per-flow retries - rerunning the suite once"
  bounded_maestro test:e2e
}
