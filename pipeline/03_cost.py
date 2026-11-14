"""Build the routing cost raster + hazard overlay + meta.json.

cost.png    uint8, 255 = impassable, 1 = free ground
hazard.png  RGBA overlay (red = steep no-go)
meta.json   the contract handed to the frontend

Usage: python pipeline/03_cost.py
"""
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = ROOT.parent / CFG["out_dir"]
RCFG = CFG["route"]
MAX_DEG = RCFG["slope_max_deg"]

slope = np.load(OUT / "slope.npy")
roughness = np.load(OUT / "rough.npy")

slope_term = np.clip(slope / MAX_DEG, 0.0, 1.0) * 80.0
p98 = max(float(np.percentile(roughness, 98)), 1e-6)
rough_term = np.clip(roughness / p98, 0.0, 1.0) * 40.0

cost = 1.0 + slope_term + rough_term
cost = np.clip(np.round(cost), 1, 254).astype("uint8")
cost[slope > MAX_DEG] = 255

Image.fromarray(cost, mode="L").save(OUT / "cost.png")

hazard = np.zeros((*cost.shape, 4), dtype="uint8")
hazard[slope > MAX_DEG] = (226, 62, 52, 72)
Image.fromarray(hazard, mode="RGBA").save(OUT / "hazard.png")

with rasterio.open(OUT / "dtm.tif") as src:
    width, height = src.width, src.height
    cell_size = abs(src.transform.a)

meta = {
    "name": CFG["name"],
    "status": CFG.get("status", ""),
    "bbox_lonlat": CFG["bbox_lonlat"],
    "grid_px": [width, height],
    "cell_size_m": cell_size,
    "route": RCFG,
    "waypoints": CFG["waypoints"],
    "images": {
        "basemap": "basemap.png",
        "cost": "cost.png",
        "hazard": "hazard.png",
    },
    "themes": [
        {"file": "cost.png",     "meaning": "uint8 traversal cost, 255 = impassable"},
        {"file": "hazard.png",   "meaning": "RGBA no-go overlay"},
    ],
}
(OUT / "meta.json").write_text(json.dumps(meta, indent=2))

print(f"cost.png   {width}x{height}  mean={cost.mean():.1f}  impassable={100.0 * (cost == 255).mean():.1f}%")
print(f"meta.json  written ({len(CFG['waypoints'])} waypoints)")
print("done. next: python pipeline/04_basemap.py")
