"""Bake hillshade relief into the ortho (or use relief alone) and export
the web basemap.

The optical input is a CTX mosaic, which carries block-to-block illumination
differences from different orbits. A gentle low-frequency flat-field
suppresses those seams without erasing real albedo contacts.

Usage: python pipeline/04_basemap.py
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

hillshade = np.load(OUT / "hillshade.npy")
ortho_path = OUT / "ortho.tif"


def fill_holes(a: np.ndarray) -> np.ndarray:
    """Replace zero/unfilled pixels with their nearest valid neighbour."""
    holes = a <= 0
    if not holes.any():
        return a
    idx = ndimage.distance_transform_edt(holes, return_distances=False, return_indices=True)
    return a[tuple(idx)]


def flat_field(a: np.ndarray, sigma: float = 90.0, blend: float = 0.55) -> np.ndarray:
    """Divide out broad brightness differences between mosaic blocks."""
    low = ndimage.gaussian_filter(a, sigma)
    low = np.maximum(low, 1e-3)
    flat = a / low * float(np.median(low))
    return (1.0 - blend) * a + blend * flat


if ortho_path.exists():
    with rasterio.open(ortho_path) as src:
        img = src.read().astype("float32")
        count = src.count
    if count == 1:
        img = fill_holes(img[0])
        img = flat_field(img)
        img = np.repeat(img[None, :, :], 3, axis=0)
    else:
        img = np.stack([flat_field(fill_holes(b)) for b in img[:3]], axis=0)

    lo, hi = np.percentile(img, 1), np.percentile(img, 99)
    if hi - lo > 0:
        img = (img - lo) / (hi - lo) * 255.0
    img = np.clip(img, 0, 255)
    out = np.clip(img * (0.45 + 0.55 * hillshade)[None, :, :], 0, 255)
    print("basemap: CTX ortho + relief blend (flat-fielded)")
else:
    # No imagery yet: relief-only map in Mars tones. Reads clean on a dark UI.
    shade = 0.25 + 0.95 * hillshade
    out = np.stack([
        np.clip(120 * shade + 34, 0, 255),
        np.clip(74 * shade + 22, 0, 255),
        np.clip(58 * shade + 18, 0, 255),
    ], axis=0)
    print("basemap: relief only (no orthoimage found)")

out = np.moveaxis(out.astype("uint8"), 0, -1)
Image.fromarray(out, mode="RGB").save(OUT / "basemap.png", optimize=True)
print(f"basemap.png {out.shape[1]}x{out.shape[0]}")
print("pipeline complete.")
