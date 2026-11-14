"""EXPERIMENTAL - not used by the app. Line-of-sight to the hab from every point.

Known issue: with a low observer and 8 m sampling the mask can come out almost
entirely shadowed, which is a plausible-but-unhelpful result. Validate before
shipping.

Produces comms.png on the SAME grid as cost.png:
    255 = comms link to hab is possible
      0 = terrain blocks line of sight (comms shadow)

Polar radial-sweep algorithm on a downsampled DTM, then upsampled back.
Cut this whole step if time is short - the frontend treats comms as optional.

Usage: python pipeline/06_viewshed.py
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = ROOT.parent / CFG["out_dir"]
RCFG = CFG["route"]
MAX_DS = 1024

with rasterio.open(OUT / "dtm.tif") as src:
    z = src.read(1).astype("float32")
    transform = src.transform
    nodata = src.nodata

if nodata is not None:
    z[z == nodata] = np.nan
if not np.isfinite(z).all():
    z = np.where(np.isfinite(z), z, float(np.nanmedian(z)))

H0, W0 = z.shape
step = max(1, int(np.ceil(max(H0, W0) / MAX_DS)))
if step > 1:
    z = z[::step, ::step]
    transform = rasterio.Affine(
        transform.a * step, transform.b, transform.c,
        transform.d, transform.e * step, transform.f,
    )
H, W = z.shape
res = abs(transform.a)

MARS_R = 3396190.0
w, s, e, n = CFG["bbox_lonlat"]
LON0 = 0.5 * (w + e)
EQ = f"+proj=eqc +lat_ts=0 +lat_0=0 +lon_0={LON0} +R={MARS_R} +units=m +no_defs"
LL = f"+proj=longlat +R={MARS_R} +no_defs"

lon, lat = RCFG["hab_lonlat"]
x, y = Transformer.from_crs(LL, EQ, always_xy=True).transform(lon, lat)
col_f, row_f = ~transform * (x, y)

if not (0 <= row_f < H and 0 <= col_f < W):
    raise SystemExit("hab point is outside the box - fix route.hab_lonlat in config.json")

z0 = float(z[int(round(row_f)), int(round(col_f))])

n_az = 1440
rr = np.arange(1.0, float(np.hypot(H, W)), 1.0)
theta = np.linspace(0.0, 2.0 * np.pi, n_az, endpoint=False)[:, None]
rows = row_f + rr[None, :] * np.sin(theta)
cols = col_f + rr[None, :] * np.cos(theta)

elev = ndimage.map_coordinates(z, [rows, cols], order=1, mode="nearest")
angle = np.arctan2(elev - z0, np.maximum(rr[None, :] * res, 1e-6))
visible_polar = angle >= np.maximum.accumulate(angle, axis=1)

yy, xx = np.mgrid[0:H, 0:W]
dy = yy - row_f
dx = xx - col_f
r_cell = np.hypot(dy, dx)
t_cell = np.mod(np.arctan2(dy, dx), 2.0 * np.pi)

az_idx = np.clip((t_cell / (2.0 * np.pi) * n_az).astype(int), 0, n_az - 1)
r_idx = np.clip((r_cell - rr[0]).astype(int), 0, len(rr) - 1)

mask = visible_polar[az_idx, r_idx].astype("uint8")
mask[r_cell >= rr[-1]] = 1

comms = Image.fromarray((mask * 255).astype("uint8"), mode="L")
comms = comms.resize(Image.open(OUT / "cost.png").size, Image.NEAREST)
comms.save(OUT / "comms.png")

print(f"comms.png  {comms.size[0]}x{comms.size[1]}  shadowed={100.0 * (mask == 0).mean():.1f}%")
print("done. optional step complete.")
