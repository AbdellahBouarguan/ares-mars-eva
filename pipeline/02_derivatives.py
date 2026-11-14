"""Slope, roughness and hillshade from the canonical DTM.

Usage: python pipeline/02_derivatives.py
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = ROOT.parent / CFG["out_dir"]

with rasterio.open(OUT / "dtm.tif") as src:
    z = src.read(1).astype("float32")
    transform = src.transform
    nodata = src.nodata

if nodata is not None:
    z[z == nodata] = np.nan
if not np.isfinite(z).all():
    z = np.where(np.isfinite(z), z, float(np.nanmedian(z)))

if float(np.nanmax(z) - np.nanmin(z)) < 1.0:
    raise SystemExit("DTM looks flat - check units, nodata and warp result")

dy_m, dx_m = abs(transform.e), abs(transform.a)
gy, gx = np.gradient(z, dy_m, dx_m)

slope = np.degrees(np.arctan(np.hypot(gx, gy)))

azimuth = np.radians(315.0 - 90.0)
altitude = np.radians(45.0)
aspect = np.arctan2(-gx, gy)
hillshade = (
    np.sin(altitude) * np.cos(np.radians(slope))
    + np.cos(altitude) * np.sin(np.radians(slope)) * np.cos(azimuth - aspect)
)
hillshade = np.clip(hillshade, 0.0, 1.0)

roughness = ndimage.maximum_filter(z, 3) - ndimage.minimum_filter(z, 3)

np.save(OUT / "slope.npy", slope)
np.save(OUT / "rough.npy", roughness)
np.save(OUT / "hillshade.npy", hillshade)

max_deg = CFG["route"]["slope_max_deg"]
print(f"slope  p50={np.median(slope):6.2f} deg   p95={np.percentile(slope, 95):6.2f} deg")
print(f"rough  p50={np.median(roughness):6.2f} m     p95={np.percentile(roughness, 95):6.2f} m")
print(f"impassable (>{max_deg} deg): {100.0 * (slope > max_deg).mean():.1f}% of box")
print("sanity: p50 slope should be ~5-15 deg and impassable under ~25%")
print("done. next: python pipeline/03_cost.py")
