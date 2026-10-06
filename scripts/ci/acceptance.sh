#!/usr/bin/env bash
# Run the built JAR and frontend bundle against disposable MySQL/Mailpit services.
set -euo pipefail

arc_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$arc_root"
arc_jar="${1:-.ci-build/backend/arc.jar}"
arc_reports="${ARC_CI_ARTIFACTS_DIR:-$arc_root/.ci-artifacts}"
arc_api_port="${ARC_CI_API_PORT:-8080}"
arc_web_port="${ARC_CI_WEB_PORT:-5173}"
arc_provider_port="${ARC_CI_PROVIDER_PORT:-$((arc_api_port + 1))}"
: "${DB_PASSWORD:?Set DB_PASSWORD for the disposable CI database}"
[[ -f "$arc_jar" ]] || { echo "Missing executable JAR: $arc_jar" >&2; exit 1; }
[[ -f frontend/dist/index.html ]] || { echo 'Build or download the frontend bundle first.' >&2; exit 1; }
mkdir -p "$arc_reports"
export ARC_API_URL="http://127.0.0.1:$arc_api_port/api/"
export ARC_WEB_URL="http://127.0.0.1:$arc_web_port"
export ARC_MAIL_URL="${ARC_MAIL_URL:-http://127.0.0.1:8025/api/v1/}"
export ARC_TEST_OUTPUT="$arc_reports/browser"
export ARC_PUBLIC_URL="$ARC_WEB_URL"
export SERVER_PORT="$arc_api_port"
export ARC_API_PROXY_TARGET="http://127.0.0.1:$arc_api_port"
export ARC_PROVIDER_FIXTURE_URL="http://127.0.0.1:$arc_provider_port"
export ARC_PROVIDER_GITHUB_API_URL="$ARC_PROVIDER_FIXTURE_URL"
export ARC_PROVIDER_GITLAB_API_URL="$ARC_PROVIDER_FIXTURE_URL/api/v4"
export ARC_INTEGRATION_ENCRYPTION_KEY="$(python3 -c 'import base64, secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())')"

# Refuse to test an older server that happens to be listening on these ports.
python3 - "$arc_api_port" "$arc_web_port" "$arc_provider_port" <<'PY'
import socket, sys
for port in sys.argv[1:]:
    with socket.socket() as check:
        check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        check.bind(("127.0.0.1", int(port)))
PY

arc_backend_pid=''
arc_frontend_pid=''
arc_provider_pid=''
cleanup() {
  local arc_status=$?
  trap - EXIT
  for arc_pid in "$arc_backend_pid" "$arc_frontend_pid" "$arc_provider_pid"; do
    if [[ -n "$arc_pid" ]]; then
      kill -- "-$arc_pid" 2>/dev/null || true
      wait "$arc_pid" 2>/dev/null || true
    fi
  done
  exit "$arc_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
setsid python3 scripts/provider-fixture.py --port "$arc_provider_port" >"$arc_reports/provider-fixture.log" 2>&1 &
arc_provider_pid=$!
setsid java -Xmx512m -jar "$arc_jar" >"$arc_reports/backend.log" 2>&1 &
arc_backend_pid=$!
setsid pnpm --dir frontend exec vite preview --host 127.0.0.1 --port "$arc_web_port" --strictPort >"$arc_reports/frontend.log" 2>&1 &
arc_frontend_pid=$!

wait_ready() {
  local arc_url="$1" arc_pid="$2"
  for ((arc_attempt=0; arc_attempt<120; arc_attempt++)); do
    if ! kill -0 "$arc_pid" 2>/dev/null; then
      echo "Server stopped before becoming ready: $arc_url; see $arc_reports" >&2
      return 1
    fi
    if curl --fail --silent --max-time 2 "$arc_url" >/dev/null; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for $arc_url; see $arc_reports" >&2
  return 1
}
wait_ready "$ARC_API_PROXY_TARGET/actuator/health" "$arc_backend_pid"
wait_ready "$ARC_PROVIDER_FIXTURE_URL/health" "$arc_provider_pid"
wait_ready "$ARC_WEB_URL" "$arc_frontend_pid"
wait_ready "${ARC_MAIL_URL}messages" "$arc_backend_pid"
python3 scripts/smoke.py 2>&1 | tee "$arc_reports/api-smoke.log"
python3 scripts/integration-smoke.py 2>&1 | tee "$arc_reports/integration-smoke.log"
pnpm --dir frontend check:browser 2>&1 | tee "$arc_reports/browser-smoke.log"
