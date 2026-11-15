#!/usr/bin/env bash
# Serve an app build over the network.
#
#   ./serve.sh                 # v1  (web/)   on 8000
#   ./serve.sh 8001 web2       # v2  (web2/)  on 8001
#
# Only the chosen app dir and data/out/ are exposed. The 5.4 GB raw DEM,
# .venv/, docs and the judge PDF in the project root are NOT reachable.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8000}"
APP="${2:-web}"
STAGE="${TMPDIR:-/tmp}/wayfinder-serve-${PORT}-${APP}"

if [ ! -d "$ROOT/$APP" ]; then
  echo "no such app dir: $APP" >&2
  exit 1
fi

rm -rf "$STAGE"
mkdir -p "$STAGE/data"
ln -s "$ROOT/$APP" "$STAGE/$APP"
ln -s "$ROOT/data/out" "$STAGE/data/out"

LAN="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1 || true)"

echo "serving ${APP}"
echo "  local : http://localhost:${PORT}/${APP}/"
if [ -n "${LAN:-}" ]; then
  echo "  lan   : http://${LAN}:${PORT}/${APP}/"
fi
echo "  scope : ${APP}/ and data/out/ only"
echo

exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$STAGE"
