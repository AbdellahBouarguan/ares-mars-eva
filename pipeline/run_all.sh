#!/usr/bin/env bash
# Full pipeline: raw HiRISE products in data/raw -> web products in data/out
set -euo pipefail
cd "$(dirname "$0")/.."

PY=./.venv/bin/python
[ -x "$PY" ] || PY=python3

echo "== 00 inspect =="
$PY pipeline/00_check.py data/raw/dtm.tif || true

echo "== 01 canonical grid =="
$PY pipeline/01_grid.py

echo "== 02 derivatives =="
$PY pipeline/02_derivatives.py

echo "== 03 cost raster =="
$PY pipeline/03_cost.py

echo "== 04 basemap =="
$PY pipeline/04_basemap.py

echo "== 05 export layers =="
$PY pipeline/05_export_layers.py

echo "== 07 REMS weather =="
$PY pipeline/07_rems.py || echo "REMS fetch failed - keeping existing rems.json"

echo "== 08 THEMIS thermal =="
$PY pipeline/08_themis.py || echo "THEMIS fetch failed - skipping thermal layer"

if [ "${WITH_COMMS:-0}" = "1" ]; then
  echo "== 06 comms viewshed =="
  $PY pipeline/06_viewshed.py
fi

echo
echo "products in data/out:"
ls -lh data/out/ | grep -v '^total'
