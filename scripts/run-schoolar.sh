#!/usr/bin/env bash
set -euo pipefail

api_port="${API_PORT:-5000}"
web_port="${PORT:-3000}"
base_path="${BASE_PATH:-/artifacts/app/}"

PORT="$api_port" RATE_LIMIT_STORE="${RATE_LIMIT_STORE:-memory}" \
  pnpm --filter @workspace/api-server dev &
api_pid=$!

cleanup() {
  kill "$api_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

PORT="$web_port" BASE_PATH="$base_path" API_URL="http://127.0.0.1:$api_port" \
  pnpm --prefix artifacts/app dev
