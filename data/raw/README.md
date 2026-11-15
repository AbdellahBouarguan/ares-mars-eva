# data/raw — inputs (not committed)

Drop exactly two files here. Everything downstream is derived from them.

| File | What it must be | Where to get it |
|---|---|---|
| `dtm.tif` | A **digital terrain model** (elevation in metres), 1–2 m/px ideally | `uahirise.org/dtm/` → filter by the Gale bounding box |
| `ortho.tif` | The **optical orthoimage** covering the same footprint | `uahirise.org` HiRISE RED product for the same area |

## Before downloading anything

1. Open **Mars Trek** (`trek.nasa.gov/mars/`).
2. Enable the **HiRISE DTM footprint** layer.
3. Zoom to the Gale / Mount Sharp northwest flank.
4. Confirm at least one DTM footprint falls inside your 3 × 5 km box.

If none does, fall back in this order: **HRSC DTM (~50 m/px)** →
**USGS Mars HRSC+MOLA Blended DEM (200 m/px, global, always available)**.

## Box

Current placeholder in `pipeline/config.json`:

    bbox_lonlat: [137.322, -4.80, 137.422, -4.72]   # west, south, east, north

Verify and replace it with your real box. The center should be a named
Curiosity target on the clay → sulfate transition, read off the traverse.

## Then

```bash
./../.venv/bin/python pipeline/00_check.py data/raw/dtm.tif data/raw/ortho.tif
```

Check that `crs` is not `None`. If it is, you have the wrong product.
