"""Warp the DTM (and optionally an orthoimage) onto ONE canonical grid.

Every downstream product shares this grid, so a pixel coordinate in
cost.png is the same pixel coordinate in basemap.png.

Large sources are read through a window, not loaded whole.

Usage: python pipeline/01_grid.py
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = ROOT.parent / CFG["out_dir"]
OUT.mkdir(parents=True, exist_ok=True)

MARS_R = 3396190.0
LL = f"+proj=longlat +R={MARS_R} +no_defs"
w, s, e, n = CFG["bbox_lonlat"]
LON0 = 0.5 * (w + e)
EQ = f"+proj=eqc +lat_ts=0 +lat_0=0 +lon_0={LON0} +R={MARS_R} +units=m +no_defs"

tr = Transformer.from_crs(LL, EQ, always_xy=True)
corners = [tr.transform(lon, lat) for lon, lat in [(w, s), (e, s), (e, n), (w, n)]]
xmin = min(c[0] for c in corners)
xmax = max(c[0] for c in corners)
ymin = min(c[1] for c in corners)
ymax = max(c[1] for c in corners)

res = float(CFG["target_res_m"])
biggest = max((xmax - xmin) / res, (ymax - ymin) / res)
if biggest > CFG["max_px"]:
    res *= biggest / CFG["max_px"]
    print(f"downscaling to fit max_px={CFG['max_px']} -> {res:.2f} m/px")

W = int(round((xmax - xmin) / res))
H = int(round((ymax - ymin) / res))
dst_transform = from_origin(xmin, ymax, res, res)
print(f"canonical grid: {W} x {H} px @ {res:.3f} m/px")


def warp(src_path: Path, dst_path: Path, resampling) -> bool:
    if not src_path.exists():
        print(f"skip (not found): {src_path}")
        return False
    with rasterio.open(src_path) as src:
        if src.crs is None:
            raise SystemExit(f"{src_path} has no CRS - cannot place it on a grid")

        # Read only the window we need. Huge mosaics stay on disk.
        if src.crs.is_geographic:
            win = from_bounds(w, s, e, n, transform=src.transform)
            win = win.round_offsets().round_lengths()
            # pad so the warp never leaves an unpainted edge column/row
            win = rasterio.windows.Window(
                win.col_off - 2, win.row_off - 2, win.width + 4, win.height + 4
            )
            win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
            src_tf = src.window_transform(win)
            data = src.read(window=win)
            src_crs = LL  # verified: 1 px = 1.000 m on the R=3396190 sphere
            print(f"  windowed read {win.width:.0f}x{win.height:.0f} px")
        else:
            src_tf = src.transform
            data = src.read()
            src_crs = src.crs

        bands = 1 if data.shape[0] == 1 else min(3, data.shape[0])
        profile = dict(
            driver="GTiff", width=W, height=H, count=bands,
            dtype=data.dtype.name, crs=EQ, transform=dst_transform, compress="deflate",
        )
        with rasterio.open(dst_path, "w", **profile) as dst:
            for b in range(bands):
                arr = np.zeros((H, W), dtype=data.dtype)
                reproject(
                    source=data[b], destination=arr,
                    src_transform=src_tf, src_crs=src_crs, src_nodata=src.nodata,
                    dst_transform=dst_transform, dst_crs=EQ, dst_nodata=0,
                    resampling=resampling,
                )
                dst.write(arr, b + 1)
    print(f"wrote {dst_path.name} ({bands} band, {W}x{H})")
    return True


warp(ROOT.parent / CFG["dtm_path"], OUT / "dtm.tif", Resampling.bilinear)
warp(ROOT.parent / CFG["ortho_path"], OUT / "ortho.tif", Resampling.cubic)
print("done. next: python pipeline/02_derivatives.py")
