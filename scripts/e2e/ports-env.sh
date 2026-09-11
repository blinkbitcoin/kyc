#!/usr/bin/env bash
# Sourced by the e2e/ci scripts: exports every service's port variable
# (KYC_API_PORT, KYC_WEB_PORT, KYC_WEB_PROXY_PORT, TOKEN_PORT, SMOKE_PORT, ...)
# resolved from
# KYC_PORT_BASE + the service's offset, a variable already set by the caller
# winning. The table is scripts/lib/ports.mjs.
eval "$(node "$(dirname "${BASH_SOURCE[0]}")/ports.mjs" env)"
