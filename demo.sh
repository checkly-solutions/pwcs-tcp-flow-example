#!/usr/bin/env bash
# Failure-injection / validation driver for the launcher protocol example.
# Prove the checks fail meaningfully before you trust them green.
#
#   ./demo.sh working              local suite, all green (~1s, mock boots itself)
#   ./demo.sh break                local: 20% simulated packet loss -> the 49-of-50 gate fails
#   ./demo.sh break-auth           local: gateway UP, TLS UP, auth plane BROKEN
#                                  (login specs fail while reachability still looks healthy)
#
#   ./demo.sh working --cloud      same suite, green on Checkly's cloud runners (recorded)
#   ./demo.sh break   --cloud      red on Checkly's cloud runners, shareable result link
#
# Cloud verbs need CHECKLY_API_KEY / CHECKLY_ACCOUNT_ID in .env (see
# .env.example) or a prior `npx checkly login`. Everything here is local or
# session-scoped — nothing touches the checks deployed in your account.
#
# break-auth is local-only by design: it needs the server and the specs to
# disagree about the password, which a single env var can't express (both
# sides read GW_PASS).
set -euo pipefail
cd "$(dirname "$0")"

# .env: Checkly auth for the cloud verbs, optional GW_* overrides for local runs.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

VERB="${1:-}"
TARGET="${2:-}"

LOCAL_TEST=(npx playwright test --config launcher/playwright.config.ts)
CLOUD_TEST=(npx checkly test launcher-suite --record)

banner() { printf '\n\033[1m%s\033[0m\n\n' "$*"; }

case "${VERB}:${TARGET}" in
  working:)
    banner "WORKING (local) — mock gateway boots via webServer, 4 specs, expect all green"
    "${LOCAL_TEST[@]}"
    ;;
  working:--cloud)
    banner "WORKING (Checkly cloud runners) — recorded session, expect green"
    "${CLOUD_TEST[@]}"
    ;;
  break:)
    banner "BREAK (local) — GW_DROP_RATE=0.2: mock drops ~20% of PONGs, 49-of-50 gate fails"
    GW_DROP_RATE=0.2 "${LOCAL_TEST[@]}" || true
    banner "That red assertion — 'expected at least 49 of 50 responses' — is the expected failure."
    ;;
  break:--cloud)
    banner "BREAK (Checkly cloud runners) — same packet loss, red recorded session with link"
    "${CLOUD_TEST[@]}" -e GW_DROP_RATE=0.2 || true
    banner "Open the result link above: trace, per-spec output, the failing assertion."
    ;;
  break-auth:)
    banner "BREAK-AUTH (local) — gateway up, TLS handshake fine, but the auth plane is broken"
    GW_PASS=not-the-real-password node launcher/server/launcher-gateway.mjs &
    GATEWAY_PID=$!
    sleep 1
    "${LOCAL_TEST[@]}" || true
    kill "${GATEWAY_PID}" 2>/dev/null || true
    banner "login-success + packet-blast red, login-rejected + egress green: a port/status \
check calls this system healthy. Only speaking the protocol catches it."
    ;;
  *)
    sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
