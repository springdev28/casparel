#!/usr/bin/env bash
# @fileOverview: Repository tooling role: implements Run Schoolar for workspace development, build, validation, or documentation.
# System connection: invoked by package scripts or maintainers; it is not part of the end-user runtime bundle.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export PORT="${PORT:-23863}"
export BASE_PATH="${BASE_PATH:-/}"
export API_URL="${API_URL:-http://127.0.0.1:8080}"

exec pnpm --filter @workspace/app run dev
