#!/usr/bin/env bash
#
# Set up abi_server, build and start Next.js, then run E2E tests.
# Usage: ./scripts/run-e2e.sh [--skip-build] [--skip-server]
#
# Env overrides:
#   BACKEND_URL          abi_server base URL (default: http://localhost:8000)
#   NEXTJS_PORT          Next.js port (default: 3000)
#   ABI_DB_PATH          SQLite DB path (default: /tmp/abi_server.db)
#   KEEP_SERVERS         set to 1 to leave servers running after exit

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
NEXTJS_PORT="${NEXTJS_PORT:-3000}"
ABI_DB_PATH="${ABI_DB_PATH:-/tmp/abi_server.db}"
ABI_SERVER_DIR="$(cd "$(dirname "$0")/../abi_server" && pwd)"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ABI_SERVER_LOG="/tmp/abi_server.log"
NEXTJS_LOG="/tmp/nextjs.log"

# Detect python command (macOS ships python3 only)
if command -v python3 &>/dev/null; then
  PYTHON=python3
elif command -v python &>/dev/null; then
  PYTHON=python
else
  echo "Error: python3 or python not found"; exit 1
fi

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
  [ -n "${ABI_PID:-}" ] && kill "$ABI_PID" 2>/dev/null || true
  [ -n "${NEXT_PID:-}" ] && kill "$NEXT_PID" 2>/dev/null || true
}
trap cleanup EXIT

# --- 1. Install abi_server dependencies ---
echo "==> Installing abi_server..."
(cd "$ABI_SERVER_DIR" && $PYTHON -m pip install -e . -q)

# --- 2. Create SQLite DB from CSV ---
echo "==> Creating SQLite DB at $ABI_DB_PATH..."
$PYTHON - <<PYEOF
import csv, sqlite3, sys

csv_path = "$ABI_SERVER_DIR/tests/evm.func_sign.csv"
db_path  = "$ABI_DB_PATH"

conn = sqlite3.connect(db_path)
conn.execute("""
  CREATE TABLE IF NOT EXISTS func_signs (
    pkey TEXT PRIMARY KEY, byte_sign TEXT NOT NULL,
    text_sign TEXT NOT NULL, abi TEXT, score INTEGER DEFAULT 0
  )
""")
conn.execute("CREATE INDEX IF NOT EXISTS idx_byte_sign ON func_signs (byte_sign)")

with open(csv_path) as f:
    rows = [
        (r["pkey"], r["byte_sign"], r["text_sign"], r["abi"], int(r["score"]))
        for r in csv.DictReader(f)
    ]
conn.executemany("INSERT OR IGNORE INTO func_signs VALUES (?,?,?,?,?)", rows)
conn.commit()
conn.close()
print(f"Loaded {len(rows)} rows into {db_path}")
PYEOF

# --- 3. Start abi_server ---
if [ "$SKIP_SERVER" = false ]; then
  echo "==> Starting abi_server on $BACKEND_URL ..."
  POSTGRES_DATABASE_URL="sqlite:///$ABI_DB_PATH" \
    nohup $PYTHON -m uvicorn main:app --host 0.0.0.0 --port 8000 \
    > "$ABI_SERVER_LOG" 2>&1 &
  ABI_PID=$!
fi

# --- 4. Build Next.js ---
if [ "$SKIP_BUILD" = false ]; then
  echo "==> Building Next.js..."
  BACKEND_URL="$BACKEND_URL" npm run build --prefix "$ROOT_DIR"
fi

# --- 5. Start Next.js ---
if [ "$SKIP_SERVER" = false ]; then
  echo "==> Starting Next.js on port $NEXTJS_PORT..."
  BACKEND_URL="$BACKEND_URL" \
    nohup npm run start --prefix "$ROOT_DIR" > "$NEXTJS_LOG" 2>&1 &
  NEXT_PID=$!
fi

# --- 6. Wait for servers ---
echo "==> Waiting for servers..."
npx wait-on "http://localhost:$NEXTJS_PORT" "$BACKEND_URL/openapi.json" --timeout 30000

# --- 7. Run E2E tests ---
echo "==> Running E2E tests..."
BACKEND_URL="$BACKEND_URL" CI=true npm run test:e2e --prefix "$ROOT_DIR"
TEST_EXIT=$?

# --- 8. Dump logs on failure ---
if [ "$TEST_EXIT" -ne 0 ]; then
  echo "=== abi_server log ==="
  cat "$ABI_SERVER_LOG" 2>/dev/null || true
  echo "=== nextjs log ==="
  cat "$NEXTJS_LOG" 2>/dev/null || true
fi

exit "$TEST_EXIT"
