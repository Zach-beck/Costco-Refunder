#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export LOCAL_MODE=1
export DATA_DIR="${DATA_DIR:-./data}"
export SESSION_SECRET="${SESSION_SECRET:-dev-only-session-secret}"
export WEB_URL="${WEB_URL:-http://localhost:5173}"
export API_URL="${API_URL:-http://127.0.0.1:3001}"
export PORT="${PORT:-3001}"
# Listen on this machine only unless HOST is set in .env.
export HOST="${HOST:-127.0.0.1}"
export NODE_ENV="${NODE_ENV:-development}"

echo "Building shared packages..."
yarn workspace @costco-refunder/shared build
yarn workspace @costco-refunder/parser build

echo ""
echo "Starting local API on ${API_URL} and web on ${WEB_URL}"
echo "Data stays in ${DATA_DIR}. No Docker and no Costco login."
echo ""

yarn workspace @costco-refunder/api dev &
API_PID=$!
yarn workspace @costco-refunder/web dev &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
