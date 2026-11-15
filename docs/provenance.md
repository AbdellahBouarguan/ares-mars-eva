# Data provenance and write-up

What A.R.E.S uses, what we did to it, and what it cannot tell you. Built for the
2026 NASA Space Apps Challenge.

## What it does

A.R.E.S plans a walking route between two points on the Martian surface and
reports whether a suited astronaut could complete it and return.

Five kinds of NASA data feed the planner:

| Type | Layer | Resolution | Class |
|---|---|---|---|
| Topographic | Gale Crater DEM | 1 m → 4 m grid | measured |
| Optical | CTX mosaic | ~5 m → 4 m | measured |
| Thermal | THEMIS IR Day mosaic | 100 m → 4 m | measured, qualitative |
| Atmospheric | MSL REMS, Sol 4995 | point | measured |
| Radiation | MSL RAD background rate | point | measured |

Modelled surface temperature is layered on top of these. It is not data, and the
interface says so wherever it appears.

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

Route cost is a direct function of elevation, so the DEM carries the method. The
rest of the stack answers narrower questions. CTX shows the astronaut what the
ground looks like. THEMIS supplies regional thermal context. RAD sets the dose
budget and REMS sets the conditions for the sol.

### What we did to it

- Reprojected the DEM and CTX onto one Mars equirectangular grid at 4 m/px.
- Derived slope, roughness and hillshade, then quantised a cost raster to 8 bits
  with 255 marking anything above 25°.
- Flat-fielded and percentile-stretched the CTX mosaic, and blended DEM relief
  into it.
- Fetched the THEMIS mosaic at its native 59 × 47 px for the box, resampled it,
  and colourised it.
- Cached a single REMS sol, including the measured ground temperature.

### What it cannot tell you

- Rock hardness, bearing strength, or how a suit actually moves over a surface.
- Anything smaller than 4 m, which is the grid resolution.
- Absolute surface temperature. The model captures spatial variation, about
  17 °C across the box, and contains no diurnal term. REMS measures an 88 °C
  swing at the same site.
- Whether a route is safe. The tool reports constraints. It does not certify
  them.

## Data we did not use

- MSL DAN. Subsurface hydrogen measured along the traverse, with no spatial
  coverage of the working box.
- CheMin, APXS, ChemCam. Point chemistry at named targets, not yet tied to
  waypoints.
- Curiosity traverse. Still the validation overlay we want most.
- HiRISE RED. It would give 25–50 cm optical imagery, and the pipeline already
  accepts it as `data/raw/ortho.tif`.
- CRISM. Spectral mineralogy in sparse swaths; using it would mean digitising
  published detections.
- Comms line of sight. An implementation exists, but it returns an all-shadowed
  mask at 8 m sampling with a low observer, so we left it out.

## References

- Gale Crater DEM. NASA/JPL Mars Trek.
- CTX mosaic. NASA/JPL-Caltech/MSSS, via Mars Trek.
- THEMIS IR Day 100m Global Mosaic v12. NASA/JPL/Arizona State University, via
  USGS Astrogeology.
- MSL RAD. NASA/JPL/SwRI.
- MSL REMS. NASA/JPL/Centro de Astrobiología, published as an outreach feed.
- J. A. Hoffman, *EVA: Walking and Working in Space*. Background reading on
  extra-vehicular activity; not redistributed.
- Software: rasterio, pyproj, numpy, scipy, Pillow. The A\* implementation is
  written from first principles.
- No NASA, JPL or mission logos are used anywhere in the product or the demo.
