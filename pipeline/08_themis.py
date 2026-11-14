"""Pull the THEMIS IR Day mosaic for our box from the USGS WMS.

Layer: "THEMIS IR Day 100m Global Mosaic v12"
    https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map

The service returns a RENDERED image, not Kelvin values, so this ships as a
qualitative thermal-context layer. It is 100 m/px natively: it must be
badged and never used as a routing input.

Output: data/out/themis.png (RGB, colourised, same grid as cost.png)
        meta.json gains a "thermal" block

Usage: python pipeline/08_themis.py
"""
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = ROOT.parent / CFG["out_dir"]

WMS = "https://planetarymaps.usgs.gov/cgi-bin/mapserv"
PARAMS = {"map": "/maps/mars/mars_simp_cyl.map"}
LAYER = "THEMIS"
MARS_M_PER_DEG = 59274.4
NATIVE_M = 100.0

# thermal ramp: cold slate -> warm amber -> hot white
RAMP = [(26, 30, 46), (58, 62, 96), (120, 92, 96), (188, 132, 84), (236, 190, 120), (252, 244, 226)]

w, s, e, n = CFG["bbox_lonlat"]
lat_mid = 0.5 * (s + n)
w_m = (e - w) * MARS_M_PER_DEG * math.cos(math.radians(lat_mid))
h_m = (n - s) * MARS_M_PER_DEG
req_w = max(2, round(w_m / NATIVE_M))
req_h = max(2, round(h_m / NATIVE_M))
print(f"box {w_m:.0f} x {h_m:.0f} m  ->  request {req_w} x {req_h} px at {NATIVE_M:.0f} m")

q = dict(PARAMS)
q.update({
    "service": "WMS", "version": "1.1.1", "request": "GetMap",
    "layers": LAYER, "styles": "",
    "srs": "EPSG:4326",
    "bbox": f"{w},{s},{e},{n}",
    "width": req_w, "height": req_h,
    "format": "image/png",
})
url = WMS + "?" + urllib.parse.urlencode(q)

req = urllib.request.Request(url, headers={"User-Agent": "Wayfinder/1.0"})
with urllib.request.urlopen(req, timeout=60) as resp:
    ctype = resp.headers.get("Content-Type", "")
    body = resp.read()

if "image" not in ctype:
    raise SystemExit(f"WMS did not return an image ({ctype}):\n{body[:400]}")

tmp = OUT / "_themis_native.png"
tmp.write_bytes(body)
native = Image.open(tmp).convert("L")

# resample to the canonical grid so it overlays exactly
with Image.open(OUT / "cost.png") as c:
    GW, GH = c.size
g = native.resize((GW, GH), Image.BICUBIC)

a = np.asarray(g, dtype="float32")
lo, hi = np.percentile(a, 2), np.percentile(a, 98)
a = np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1)

pos = a * (len(RAMP) - 1)
k = np.clip(np.floor(pos).astype(int), 0, len(RAMP) - 2)
f = (pos - k)[..., None]
ramp = np.array(RAMP, dtype="float32")
rgb = ramp[k] * (1 - f) + ramp[k + 1] * f
Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"), mode="RGB").save(OUT / "themis.png")
tmp.unlink(missing_ok=True)

meta_path = OUT / "meta.json"
meta = json.loads(meta_path.read_text())
meta["thermal"] = {
    "file": "themis.png",
    "source": "THEMIS IR Day 100m Global Mosaic v12",
    "provider": "USGS Astrogeology / NASA-JPL / ASU",
    "native_resolution_m": int(NATIVE_M),
    "native_request_px": [req_w, req_h],
    "qualitative": True,
    "measured": True,
    "note": "Rendered WMS image of THEMIS daytime IR, not Kelvin values. "
            "100 m/px is 25x coarser than the route grid. Regional context only; "
            "never used as a routing input. BRIGHT = warmer daytime surface.",
}
meta_path.write_text(json.dumps(meta, indent=2))

print(f"themis.png {GW}x{GH}  (native {native.size[0]}x{native.size[1]})")
print("meta.json updated with thermal block")
