#!/usr/bin/env bash
# Sourced by android-maestro.sh and ios-maestro.sh. A starved emulator or
# simulator can leave Maestro waiting on its driver with no flow output (#41).
# Bound the suite here, inside the script, so what follows (the Android logcat
# post-mortem, the iOS suite retry decision) still runs: the step's
# timeout-minutes is only the backstop and kills the script outright.
#
#   bounded_maestro <npm run args...>   -> exit status; 124 when the bound hit
#
# Implemented in plain bash (a background job polled against a deadline)
# because coreutils `timeout` is not on the macOS runners - a
# `timeout`/`gtimeout` fallback silently runs unbounded there, so an iOS
# driver hang costs the whole step timeout. The poll interval and the
# TERM->KILL grace are tunable so the test suite can exercise the bound fast.
MAESTRO_SUITE_TIMEOUT="${MAESTRO_SUITE_TIMEOUT:-10m}"
MAESTRO_POLL_SECONDS="${MAESTRO_POLL_SECONDS:-5}"
MAESTRO_KILL_GRACE_SECONDS="${MAESTRO_KILL_GRACE_SECONDS:-10}"

# "10m" / "90s" / "600" -> seconds
timeout_seconds() {
  case "$1" in
    *m) echo $(( ${1%m} * 60 )) ;;
    *s) echo "${1%s}" ;;
    *) echo "$1" ;;
  esac
}

bounded_maestro() {
  local limit waited=0 pid status
  limit=$(timeout_seconds "$MAESTRO_SUITE_TIMEOUT")
  npm run "$@" &
  pid=$!
  while kill -0 "$pid" 2> /dev/null; do
    if [ "$waited" -ge "$limit" ]; then
      echo "::error::Maestro suite exceeded $MAESTRO_SUITE_TIMEOUT without completing (#41)"
      # npm wraps the Maestro CLI (a Java process): stop both, gently then hard
      pkill -TERM -f 'maestro' 2> /dev/null || true
      kill -TERM "$pid" 2> /dev/null || true
      sleep "$MAESTRO_KILL_GRACE_SECONDS"
      pkill -KILL -f 'maestro' 2> /dev/null || true
      kill -KILL "$pid" 2> /dev/null || true
      wait "$pid" 2> /dev/null
      return 124
    fi
    sleep "$MAESTRO_POLL_SECONDS"
    waited=$((waited + MAESTRO_POLL_SECONDS))
  done
  wait "$pid"
  status=$?
  return "$status"
}
