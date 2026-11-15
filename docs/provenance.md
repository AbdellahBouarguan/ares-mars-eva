# Data provenance and write-up

A public record of what A.R.E.S uses, what was done to it, and what it cannot
tell you. Built for the **2026 NASA Space Apps Challenge**.

---

## What it does

A.R.E.S — Advanced Regolith & Environmental Survivor — plans a walking route
between two points on the Martian surface and reports whether two suited
astronauts could complete it and return.

It layers five kinds of NASA data over one another:

| Type | Layer | Resolution | Class |
|---|---|---|---|
| Topographic | Gale Crater DEM | 1 m → 4 m grid | measured |
| Optical | CTX mosaic | ~5 m → 4 m | measured |
| Thermal | THEMIS IR Day mosaic | 100 m → 4 m | measured, qualitative |
| Atmospheric | MSL REMS, Sol 4995 | point | measured |
| Radiation | MSL RAD background rate | point | measured |

Plus one derived layer — **modelled surface temperature** — which is not data
and is labelled as such everywhere it appears.

---

## Data table

| Dataset | Source | How we used it | Status |
|---|---|---|---|
| Gale Crater DEM, 1 m | NASA/JPL **Mars Trek** | Slope, roughness, elevation profile, route cost, terrain rendering | **In app** |
| CTX BlockAdj mosaic | NASA/JPL-Caltech/MSSS, via **Mars Trek** | Optical basemap, blended with DEM hillshade | **In app** |
| THEMIS IR Day 100m Global Mosaic v12 | NASA/JPL/ASU, via USGS Astrogeology | Thermal context layer, 100 m/px, qualitative | **In app** |
| MSL RAD | NASA/JPL/SwRI | Radiation dose budget (0.64 mSv/day at Gale) | **In app** |
| MSL REMS | NASA/JPL/Centro de Astrobiología | Sol 4995 weather card: air + ground temperature, pressure, opacity, UV, daylight | **In app** |
| Mars Trek | `trek.nasa.gov/mars` | Access point for both the DEM and the CTX mosaic; coverage verification before download | **Used** |
| Curiosity's Proposed Path up Mount Sharp | Challenge resources | Mission framing: the science route a rover can take, re-planned for a suited walker | Used |

### Which dataset, and why that one

The **DEM drives the method** — route cost is literally a function of elevation.
Nothing else in the stack is decorative: CTX is what the crew looks at, THEMIS
is regional thermal context, RAD sets the dose budget, REMS sets the sol
conditions.

### What we did to it

- Reprojected the DEM and CTX onto one Mars equirectangular grid at 4 m/px.
- Derived slope, roughness and hillshade; quantised a cost raster to 8 bits
  (255 = impassable above 25°).
- Flat-fielded and percentile-stretched the CTX mosaic, then blended DEM relief
  into it.
- Fetched the THEMIS mosaic at native 59 × 47 px for the box, resampled and
  colourised it.
- Cached one real REMS sol, including its measured ground temperature.

### What it cannot tell you

- Rock hardness, bearing strength, or suit-scale trafficability.
- Anything below 4 m — the grid resolution floor.
- Absolute surface temperature. The model captures spatial variation only
  (~17 °C across the box) and has no diurnal term, while REMS measures an
  88 °C diurnal swing at the same site.
- Whether the route is safe. It reports constraints; it does not certify them.

---

## Data we did **not** use

Listed deliberately, because naming what is absent is part of the claim:

- **MSL DAN** (subsurface hydrogen) — line-of-traverse only, no spatial coverage
  of the working box.
- **CheMin / APXS / ChemCam** — point chemistry at named targets, not yet tied
  to waypoints.
- **Curiosity traverse** — the validation overlay we most want; not yet done.
- **HiRISE RED** — would give 25–50 cm optical imagery; the pipeline already
  accepts it as `data/raw/ortho.tif`.
- **CRISM** — spectral mineralogy; sparse swaths, would require digitising
  published detections.
- **Comms line-of-sight** — an implementation exists but returns a degenerate
  all-shadowed mask at 8 m sampling with a low observer. Excluded rather than
  shipped wrong.

---

## References

- Gale Crater DEM — NASA/JPL Mars Trek
- CTX mosaic — NASA/JPL-Caltech/MSSS, via Mars Trek
- THEMIS IR Day 100m Global Mosaic v12 — NASA/JPL/Arizona State University,
  via USGS Astrogeology
- MSL RAD — NASA/JPL/SwRI
- MSL REMS — NASA/JPL/Centro de Astrobiología (published as an outreach feed)
- J. A. Hoffman, *EVA: Walking and Working in Space* — background reading on
  extra-vehicular activity; not redistributed
- Software: rasterio, pyproj, numpy, scipy, Pillow; A\* implemented from first
  principles
- No NASA, JPL or mission logos are used anywhere in the product or the demo
