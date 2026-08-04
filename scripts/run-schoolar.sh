#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

api_port="${API_PORT:-5000}"
web_port="${PORT:-23863}"
base_path="${BASE_PATH:-/}"

PORT="$api_port" RATE_LIMIT_STORE="${RATE_LIMIT_STORE:-memory}" \
  setsid pnpm --filter @workspace/api-server dev &
api_pid=$!

PORT="$web_port" BASE_PATH="$base_path" API_URL="http://127.0.0.1:$api_port" \
  setsid pnpm --prefix artifacts/app dev &
web_pid=$!

cleanup() {
  kill -TERM -- "-$api_pid" "-$web_pid" 2>/dev/null || true
  wait "$api_pid" "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Exit if either service fails; the trap stops its sibling as well.
wait -n "$api_pid" "$web_pid"
