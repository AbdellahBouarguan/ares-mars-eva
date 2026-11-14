"""Inspect raw input rasters before anything else touches them.

Usage:
    python pipeline/00_check.py data/raw/dtm.tif data/raw/ortho.tif
"""
import sys
from pathlib import Path

try:
    import rasterio
except ModuleNotFoundError:
    sys.exit("rasterio missing - run: ./.venv/bin/pip install -r pipeline/requirements.txt")

if len(sys.argv) < 2:
    sys.exit(__doc__)

for path in sys.argv[1:]:
    p = Path(path)
    if not p.exists():
        print(f"{p}  -> MISSING")
        continue
    with rasterio.open(p) as src:
        print(p.name)
        print(f"  crs      : {src.crs}")
        print(f"  bounds   : {tuple(round(v, 4) for v in src.bounds)}")
        print(f"  size     : {src.width} x {src.height}  bands={src.count}  dtype={src.dtypes[0]}")
        print(f"  pixel    : {abs(src.transform.a):.6f} x {abs(src.transform.e):.6f}")
        print(f"  nodata   : {src.nodata}")
        print(f"  size on disk: {p.stat().st_size / 1e6:.1f} MB")
        if src.crs is None:
            print("  !! NO CRS - this file cannot be georeferenced. Get another product.")
        print()
