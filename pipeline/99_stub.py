"""Generate a SYNTHETIC placeholder dataset so the frontend can start now.

THIS IS NOT MARS DATA. It exists only so the web app can be built and
tested while the real HiRISE products are being downloaded and clipped.
Running 01->04 overwrites every file this script writes.

The scene is deliberately built to exercise the router:
  - a north-south ridge with ONE walkable pass
  - a soft-sand band that must be crossed carefully
  - a butte that blocks the direct line

Usage: python pipeline/99_stub.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = ROOT.parent / CFG["out_dir"]
OUT.mkdir(parents=True, exist_ok=True)
RCFG = CFG["route"]
MAX_DEG = RCFG["slope_max_deg"]

W = H = 768
RES = 4.0
rng = np.random.default_rng(11)


def smooth_noise(px: int) -> np.ndarray:
    """Low-frequency noise at (px, px), bicubic-upscaled to the grid."""
    base = rng.normal(0.0, 1.0, (px, px)).astype("float32")
    img = Image.fromarray(base, mode="F").resize((W, H), Image.BICUBIC)
    return np.asarray(img, dtype="float32")


def gauss(cx: float, cy: float, sigma: float) -> np.ndarray:
    return np.exp(-(((gx_ - cx) ** 2 + (gy_ - cy) ** 2) / (2.0 * sigma ** 2)))


gx_, gy_ = np.meshgrid(np.arange(W, dtype="float32"), np.arange(H, dtype="float32"))

# --- base relief: gentle ramp + large rolling hills -------------------------
terrain = (gy_ / H) * 55.0 + (gx_ / W) * 20.0
terrain += smooth_noise(6) * 14.0
terrain += smooth_noise(14) * 6.0

# --- ridge wall running north-south, with a single pass ---------------------
ridge_line = np.exp(-((gx_ - 0.55 * W) ** 2) / (2 * 20.0 ** 2))
pass_gap = 1.0 - 0.85 * np.exp(-((gy_ - 0.70 * H) ** 2) / (2 * (0.06 * H) ** 2))
terrain += 120.0 * ridge_line * pass_gap

# --- butte blocking the direct line to the far target -----------------------
terrain += 55.0 * gauss(0.26 * W, 0.28 * H, 34.0)

# --- soft sand band (crossable, but expensive) ------------------------------
wavy_y = gy_ + 40.0 * np.sin(gx_ / 85.0)
sand = np.exp(-((wavy_y - 0.40 * H) ** 2) / (2 * (0.035 * H) ** 2)) > 0.55
sand = ndimage.binary_dilation(sand, iterations=5)

# --- derivatives ------------------------------------------------------------
gy, gx = np.gradient(terrain, RES, RES)
slope = np.degrees(np.arctan(np.hypot(gx, gy)))
rough = ndimage.maximum_filter(terrain, 3) - ndimage.minimum_filter(terrain, 3)

az = np.radians(315.0 - 90.0)
alt = np.radians(45.0)
aspect = np.arctan2(-gx, gy)
hillshade = np.clip(
    np.sin(alt) * np.cos(np.radians(slope))
    + np.cos(alt) * np.sin(np.radians(slope)) * np.cos(az - aspect),
    0.0, 1.0,
)

# --- cost raster ------------------------------------------------------------
cost = 1.0 + np.clip(slope / MAX_DEG, 0.0, 1.0) * 80.0
cost += np.clip(rough / max(float(np.percentile(rough, 98)), 1e-6), 0.0, 1.0) * 40.0
cost[sand] += 70.0
cost = np.clip(np.round(cost), 1, 254).astype("uint8")
cost[slope > MAX_DEG] = 255
Image.fromarray(cost, mode="L").save(OUT / "cost.png")

hazard = np.zeros((H, W, 4), dtype="uint8")
hazard[slope > MAX_DEG] = (220, 40, 40, 120)
hazard[sand] = (235, 175, 60, 85)
Image.fromarray(hazard, mode="RGBA").save(OUT / "hazard.png")

# --- basemap: muted Mars tones, clear relief --------------------------------
mottle = smooth_noise(24) * 0.5 + smooth_noise(8) * 0.25
base = np.stack([
    np.clip(158 + 26 * mottle, 0, 255),
    np.clip(101 + 18 * mottle, 0, 255),
    np.clip(78 + 14 * mottle, 0, 255),
], axis=-1)
rgb = np.clip(base * (0.42 + 0.72 * hillshade)[..., None], 0, 255).astype("uint8")
rgb[sand] = np.clip(rgb[sand].astype("float32") * 0.72 + np.array([200, 168, 128]) * 0.28, 0, 255).astype("uint8")
Image.fromarray(rgb, mode="RGB").save(OUT / "basemap.png", optimize=True)

# --- placeholder comms (real one comes from 05_viewshed.py) ----------------
comms = np.full((H, W), 255, dtype="uint8")
comms[slope > MAX_DEG] = 0
Image.fromarray(comms, mode="L").save(OUT / "comms.png")

meta = {
    "name": CFG["name"],
    "status": "SYNTHETIC PLACEHOLDER - not real Mars data",
    "synthetic": True,
    "bbox_lonlat": CFG["bbox_lonlat"],
    "grid_px": [W, H],
    "cell_size_m": RES,
    "route": RCFG,
    "waypoints": CFG["waypoints"],
    "images": {"basemap": "basemap.png", "cost": "cost.png",
               "hazard": "hazard.png", "comms": "comms.png"},
    "themes": [
        {"file": "cost.png", "meaning": "uint8 traversal cost, 255 = impassable"},
        {"file": "hazard.png", "meaning": "RGBA no-go overlay"},
        {"file": "comms.png", "meaning": "255 = line-of-sight to hab"},
    ],
}
(OUT / "meta.json").write_text(json.dumps(meta, indent=2))

print(f"stub grid   {W}x{H} @ {RES} m/px")
print(f"impassable  {100.0 * (cost == 255).mean():.1f}%   sand band {100.0 * sand.mean():.1f}%")
print(f"wrote       basemap.png cost.png hazard.png comms.png meta.json -> {OUT}")
print("SYNTHETIC ONLY - replace by running 01->04 with real HiRISE inputs")
