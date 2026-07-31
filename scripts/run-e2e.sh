#!/usr/bin/env bash
#
# Build and start Next.js, then run E2E tests.
# Usage: ./scripts/run-e2e.sh [--skip-build] [--skip-server]
#
# Env overrides:
#   NEXTJS_PORT          Next.js port (default: 3000)
#   KEEP_SERVERS         set to 1 to leave servers running after exit

set -euo pipefail

NEXTJS_PORT="${NEXTJS_PORT:-3000}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NEXTJS_LOG="/tmp/nextjs.log"

SKIP_BUILD=false
SKIP_SERVER=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --skip-server) SKIP_SERVER=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

cleanup() {
  if [ "${KEEP_SERVERS:-0}" = "1" ]; then
    echo "Servers left running (KEEP_SERVERS=1)."
    return
  fi
  echo "Stopping servers..."
  [ -n "${NEXT_PID:-}" ] && kill "$NEXT_PID" 2>/dev/null || true
}
trap cleanup EXIT

# --- 1. Build Next.js ---
if [ "$SKIP_BUILD" = false ]; then
  echo "==> Building Next.js..."
  npm run build --prefix "$ROOT_DIR"
fi

# --- 2. Start Next.js ---
if [ "$SKIP_SERVER" = false ]; then
  echo "==> Starting Next.js on port $NEXTJS_PORT..."
  nohup npm run start --prefix "$ROOT_DIR" > "$NEXTJS_LOG" 2>&1 &
  NEXT_PID=$!
fi

# --- 3. Wait for server ---
echo "==> Waiting for server..."
npx wait-on "http://localhost:$NEXTJS_PORT" --timeout 30000

# --- 4. Run E2E tests ---
echo "==> Running E2E tests..."
CI=true npm run test:e2e --prefix "$ROOT_DIR"
TEST_EXIT=$?

# --- 5. Dump logs on failure ---
if [ "$TEST_EXIT" -ne 0 ]; then
  echo "=== nextjs log ==="
  cat "$NEXTJS_LOG" 2>/dev/null || true
fi

exit "$TEST_EXIT"
