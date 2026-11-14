"""Export the layers the web app needs beyond the cost raster:

elev16.bin   int16 elevation (metres) at the cost-grid resolution
temp8.png    uint8 modelled surface temperature, linear over [t_min, t_max]
             (visual layer AND sampled along the route)

Temperature model (MODELLED, not measured):
    T = T_ref - lapse*(z - z_ref) + amp*(ci - mean(ci))
    ci = sin(alt)cos(slope) + cos(alt)sin(slope)cos(az - aspect)

Usage: python pipeline/05_export_layers.py
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = ROOT.parent / CFG["out_dir"]

T_REF_C = -55.0
LAPSE_K_KM = 2.5
AMP_K = 30.0
SUN_AZ_DEG = 315.0
SUN_ALT_DEG = 45.0

with rasterio.open(OUT / "dtm.tif") as src:
    z = src.read(1).astype("float32")
    transform = src.transform
    nodata = src.nodata

if nodata is not None:
    z[z == nodata] = np.nan
z = np.where(np.isfinite(z), z, float(np.nanmedian(z)))

H, W = z.shape
z_ref = float(np.nanmean(z))

# elevation as int16 (metres, offset-free). Mars range fits easily.
elev_i16 = np.clip(np.round(z), -32768, 32767).astype("<i2")
(OUT / "elev16.bin").write_bytes(elev_i16.tobytes())
print(f"elev16.bin  {W}x{H} int16  = {elev_i16.nbytes/1e6:.2f} MB  range {z.min():.0f}..{z.max():.0f} m")

dy_m, dx_m = abs(transform.e), abs(transform.a)
gy, gx = np.gradient(z, dy_m, dx_m)
slope = np.degrees(np.arctan(np.hypot(gx, gy)))
aspect = np.arctan2(-gx, gy)

alt = np.radians(SUN_ALT_DEG)
az = np.radians(SUN_AZ_DEG - 90.0)
ci = (
    np.sin(alt) * np.cos(np.radians(slope))
    + np.cos(alt) * np.sin(np.radians(slope)) * np.cos(az - aspect)
)
ci_mean = float(np.mean(ci))

temp_c = T_REF_C - LAPSE_K_KM * (z - z_ref) / 1000.0 + AMP_K * (ci - ci_mean)
# smooth to human-scale surface temperature rather than per-facet noise
temp_c = ndimage.gaussian_filter(temp_c, sigma=3.0)

t_min, t_max = float(np.percentile(temp_c, 0.5)), float(np.percentile(temp_c, 99.5))
norm = np.clip((temp_c - t_min) / (t_max - t_min), 0, 1)
temp8 = (norm * 255).astype("uint8")
Image.fromarray(temp8, mode="L").save(OUT / "temp8.png")
print(f"temp8.png   modelled {temp_c.min():.0f}..{temp_c.max():.0f} C, mapped {t_min:.1f}..{t_max:.1f} C")

# terrain slope, 0-90 deg mapped to 0-255
slope8 = np.clip(np.round(slope / 90.0 * 255.0), 0, 255).astype("uint8")
Image.fromarray(slope8, mode="L").save(OUT / "slope8.png")
print(f"slope8.png  {np.percentile(slope,50):.1f} deg median, {slope.max():.1f} deg max")

# roughness, normalised to its 98th percentile (same normalisation as the cost raster)
rough = np.load(OUT / "rough.npy").astype("float32")
r98 = max(float(np.percentile(rough, 98)), 1e-6)
rough8 = np.clip(np.round(np.clip(rough / r98, 0, 1) * 255.0), 0, 255).astype("uint8")
Image.fromarray(rough8, mode="L").save(OUT / "rough8.png")
print(f"rough8.png  p50={np.percentile(rough,50):.2f} m  p98={r98:.2f} m")

meta_path = OUT / "meta.json"
meta = json.loads(meta_path.read_text())
meta["elevation"] = {"file": "elev16.bin", "dtype": "int16", "unit": "m", "scale": 1.0}
meta["slope"] = {"file": "slope8.png", "max_deg": 90.0}
meta["roughness"] = {"file": "rough8.png", "p98_m": round(r98, 3)}
p10, p50, p90 = (float(np.percentile(temp_c, q)) for q in (10, 50, 90))
meta["temperature"] = {
    "file": "temp8.png", "min_c": t_min, "max_c": t_max,
    "p10_c": round(p10, 2), "p50_c": round(p50, 2), "p90_c": round(p90, 2),
    "model": "elevation lapse rate + solar incidence",
    "measured": False,
    "note": "Modelled surface temperature, not a measurement. REMS measured air "
            "temperature at Gale; this is a terrain model for planning context.",
}
meta["radiation"] = {
    "source": "MSL RAD (measured at Gale)",
    "gcr_mSv_per_day": CFG["route"]["dose_rate_mSv_day"],
    "career_limit_mSv": CFG["route"]["career_limit_mSv"],
    "note": "Single measured background rate, integrated over route duration. "
            "No spatial variation, no solar particle event modelling.",
}
meta_path.write_text(json.dumps(meta, indent=2))
print("meta.json   updated with elevation / temperature / radiation blocks")
