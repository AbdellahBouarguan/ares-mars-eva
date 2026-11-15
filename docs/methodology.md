# Methodology

> Built for the **2026 NASA Space Apps Challenge**.
> Challenge: a layered, integrated view of a location or route on the Martian
> surface that helps a human explorer plan and carry out a Marswalk.
>
> This document is the authoritative description of what A.R.E.S computes, why
> each displayed value exists, and where every number comes from. If something
> here disagrees with the code, the code is wrong.

---

## 1. Purpose and claims

Given a terrain box on Mars and two points in it, A.R.E.S estimates whether two
suited astronauts can walk between them and return within an EVA budget,
reporting terrain, thermal and radiation context along the way.

**It claims** that its terrain metrics (distance, slope, ascent, elevation) are
exact geometry over a verified 1 m digital elevation model, and that its
environmental inputs (radiation rate, weather) are real measurements.

**It does not claim** to be a certified EVA planner, a geological
interpretation, or a live-operations tool. Walk time, surface temperature,
radiation dose and the point of no return are **model estimates**, and are
labelled as such wherever they appear.

---

## 2. Study area

| Item | Value |
|---|---|
| Site | Gale Crater, northwest flank of Mount Sharp |
| Working box | `137.30 – 137.40 E`, `−4.80 – −4.72 N` |
| Box size | 5.93 × 4.74 km (28 km²) |
| Canonical grid | 1482 × 1185 px at 4 m/px = 1,756,170 cells |

### Why Gale

Radiation (RAD), weather (REMS), subsurface hydrogen (DAN) and chemistry
(CheMin/APXS/ChemCam) have all been measured *at Gale* by instruments on the
ground. No other site on Mars offers that combination, so the safety-relevant
inputs are observations rather than extrapolations. The challenge brief also
names Gale's boxwork formations as its worked example.

### Extents — imagery covers more than terrain

| Layer | Extent | Area | vs. Gale |
|---|---|---|---|
| CTX mosaic | 239.7 × 223.2 km | 53,495 km² | 2.9× the crater |
| DEM | 35.9 × 40.1 km | 1,439 km² | 7.7% of the crater |
| Working box | 5.93 × 4.74 km | 28 km² | 0.15% of the crater |

Gale is ~154 km across (~18,600 km²). Bradbury Landing lies inside the DEM; the
crater centre and Mount Sharp's summit do not. The DEM is therefore the binding
constraint — the imagery extends further, but without elevation there is no
slope, no cost and no route.

---

## 3. Data acquisition and verification

| Dataset | Product | Access | Native |
|---|---|---|---|
| Terrain | Gale crater DEM | NASA/JPL **Mars Trek** (`trek.nasa.gov/mars`) | 1 m, float32 |
| Optical | CTX BlockAdj mosaic | NASA/JPL **Mars Trek** | ~5 m, uint8 |
| Thermal | THEMIS IR Day 100m Global Mosaic v12 | USGS Astrogeology WMS | 100 m |
| Atmosphere | MSL REMS, sol 4995 | NASA/CAB JSON feed | point |
| Radiation | MSL RAD | published result | point |

### DEM

| Property | Observed |
|---|---|
| Size | 36,000 × 40,100 px, float32 |
| Bounds | `137.12247 – 137.72981 E`, `−4.92547 – −4.24896 N` |
| CRS | `ESRI:104905` (planetocentric geographic) |
| Pixel | `1.687060485811425e-5°` |
| Nodata | `−3.4028230607370965e+38` |
| Size on disk | 5.4 GB |

Verification performed before anything downstream trusted it:

1. **Scale.** `1 / 1.68706e-5° = 59,274.4 m/degree`, and
   `2πR / 360 = 59,274.4` at `R = 3,396,190 m`. The product is genuinely 1 m/px
   on a planetocentric spherical frame — the same sphere the pipeline targets.
2. **Coverage.** 0.000% nodata across the full product.
3. **Seams.** Maximum row-mean and column-mean jump 0.2 m — no mosaic seams.
4. **Sanity.** Bradbury Landing (4.5895°S, 137.4417°E) falls inside; the crater
   centre does not, which matches the product's documented extent.

### CTX

48,096 × 44,640 px, uint8, `~5 m/px`, `ESRI:104971`, bounds
`135.1843 – 139.2413 E`, `−6.5733 – −2.8078 N`. Panchromatic — no colour.
Feather blends between orbits remain visible as faint vertical boundaries; this
is a property of the source mosaic and is measured at under 1 digital number in
the column means, so it cannot be removed by brightness correction without
destroying real albedo.

### THEMIS

Retrieved by WMS GetMap against
`planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map`:

```
layers=THEMIS  styles=  srs=EPSG:4326
bbox=137.30,-4.80,137.40,-4.72
width=59  height=47  format=image/png
```

59 × 47 px is the native sampling of a 5.93 × 4.74 km box at 100 m/px. The
service returns a **rendered** image, not radiance in Kelvin, which is why the
layer is treated as qualitative.

### REMS

`mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json`, sol 4995
(terrestrial 2026-08-25, Ls 341). Eight fields stored in `data/out/rems.json`.
CAB publishes it as an outreach product; scientific REMS data lives at the PDS
Atmospheres node. Measurements are influenced by the rover itself — position,
orientation, shade, dust on the sensors.

---

## 4. Processing pipeline

Run order matters: `03_cost.py` rewrites `meta.json` from scratch, so
`05_export_layers.py` must run after it.

| Step | Input | Operation | Output |
|---|---|---|---|
| `00_check.py` | raw rasters | print CRS, bounds, size, dtype, nodata | — |
| `01_grid.py` | DEM, CTX | windowed read, reproject | `dtm.tif`, `ortho.tif` |
| `02_derivatives.py` | `dtm.tif` | slope, roughness, hillshade | `*.npy` |
| `03_cost.py` | slope, roughness | cost raster, hazard | `cost.png`, `hazard.png`, `meta.json` |
| `04_basemap.py` | `ortho.tif`, hillshade | flat-field, stretch, relief blend | `basemap.png` |
| `05_export_layers.py` | `dtm.tif`, `*.npy` | elevation, slope, roughness, temperature | `elev16.bin`, `slope8.png`, `rough8.png`, `temp8.png` |
| `07_rems.py` | REMS API | fetch one sol | `rems.json` |
| `08_themis.py` | USGS WMS | fetch, resample, colourise | `themis.png` |
| `06_viewshed.py` | — | **experimental, not shipped** | — |
| `99_stub.py` | — | synthetic terrain for frontend work | stub products |

### 4.1 Canonical grid (`01_grid.py`)

All products share one grid, so a pixel coordinate is identical in every raster.

```
EQ  = +proj=eqc +lat_ts=0 +lat_0=0 +lon_0=<mid-lon> +R=3396190 +units=m
LL  = +proj=longlat +R=3396190
res = 4.0 m/px, downscaled only if it would exceed 4096 px on the long axis
```

For geographic sources the read is windowed to the box **plus 2 px of padding**,
intersected with the image extent. The padding exists because without it the
warp left the final destination column unpainted, producing a black stripe at
the right edge. Source CRS is taken as `LL` rather than the file's `ESRI:` code,
because the 1 m/px check above already establishes the frame.

Resampling: bilinear for the DEM, cubic for imagery.

### 4.2 Derivatives (`02_derivatives.py`)

```
gy, gx     = gradient(z, dy_m, dx_m)                  # metres per metre
slope      = degrees(atan(hypot(gx, gy)))
aspect     = atan2(−gx, gy)
hillshade  = sin(alt)·cos(slope) + cos(alt)·sin(slope)·cos(az − aspect)
             alt = 45°, az = 315° − 90°
roughness  = max(z, 3×3) − min(z, 3×3)                # metres
```

Measured on the box: slope p50 **7.6°**, p95 **26.3°**, impassable **5.8%**,
roughness p50 **1.39 m**, p98 **6.56 m**, relief **987 m**.

### 4.3 Cost raster (`03_cost.py`)

```
slope_term = clip(slope / 25°, 0, 1) × 80
rough_term = clip(roughness / p98, 0, 1) × 40

cost = 255                                    if slope > 25°     ← impassable
cost = clip(round(1 + slope_term + rough_term), 1, 254)  otherwise
```

The coefficients (80, 40) are a design choice: slope dominates roughness by 2:1,
because a stiff suit is far more limited by grade than by surface texture. This
is the only place slope enters the *route*.

`hazard.png` is an RGBA overlay marking slope > 25° at alpha 72/255.

### 4.4 Basemap (`04_basemap.py`)

```
fill_holes : zeros replaced by nearest valid pixel (distance transform)
flat_field : 0.45·img + 0.55·(img / gaussian(img, σ=90) × median)
stretch    : 1st–99th percentile → 0–255
relief     : out = stretched × (0.45 + 0.55·hillshade)
```

Flat-fielding suppresses CTX block-to-block illumination. The relief blend means
the shadows on screen come from the **DEM at a fixed sun angle**, not from the
illumination present in the photograph.

### 4.5 Layer export (`05_export_layers.py`)

```
elev16.bin  int16 little-endian, metres, no offset
slope8.png  round(slope / 90 × 255)
rough8.png  round(clip(roughness / p98, 0, 1) × 255)   ← used by the speed model
temp8.png   modelled temperature, mapped over its 0.5–99.5 percentile range
```

### 4.6 THEMIS (`08_themis.py`)

Fetched at native 59 × 47, resized bicubically to 1482 × 1185, stretched to the
2nd–98th percentile, colourised through a six-stop ramp
(`#1a1e2e → #3a3e60 → #785c60 → #bc8454 → #ecbe78 → #fcf4e2`). Brighter = warmer
daytime surface. The resize adds no information; it exists so the overlay
registers exactly with the cost grid.

---

## 5. Routing algorithm

`web/js/router.js`. Weighted A\* over the 8-bit cost grid, 8-connected.

### 5.1 Endpoint snapping

`nearestWalkable()` searches outward in Chebyshev rings to a radius of 25 cells
and returns the first cell whose cost is not 255. A click on a cliff edge still
yields a valid start.

### 5.2 Node representation

A cell is a single integer `i = y·W + x`. State lives in typed arrays:

```
g       Float32Array(N)   cost-so-far, initialised to Infinity
came    Int32Array(N)     parent pointer, -1 = unvisited
closed  Uint8Array(N)     expanded flag
heap    Float32Array keys + Int32Array vals, flat binary heap, doubling growth
```

No objects are allocated per node. This is why 1.76 M cells route in 170–285 ms.

### 5.3 Search

```
g[start] = 0 ; push(h(start), start)

while heap not empty:
  cur = pop()
  if cur = goal: break
  if closed[cur]: continue
  closed[cur] = 1

  for k in 0..7:
    n = neighbour(cur, k)
    skip if out of bounds, closed, or cost[n] = 255
    if diagonal and either orthogonal neighbour is 255: skip      ← no corner cutting
    ng = g[cur] + (1 or √2) · cost[n]
    if ng < g[n]:
      g[n] = ng ; came[n] = cur ; push(ng + w·h(n), n)
```

`h` is the **octile distance** in cell units:

```
h = dx + dy + (√2 − 2)·min(dx, dy)
```

It is admissible because the cheapest possible cell costs 1, so it never
overestimates. `w = 1.15` makes the search **weighted**: faster, but the result
may be up to ~15% worse than optimal. This is a deliberate trade for
interactive re-routing.

The diagonal rule prevents the path from slipping between two impassable cells
that touch only at a corner.

### 5.4 Reconstruction

Follow `came` from the goal back to the start, reverse. A guard of `N`
iterations protects against a malformed parent chain.

### 5.5 What A\* optimises — and what it does not

A\* minimises **cost**, not time. Time, dose, temperature and the point of no
return are computed in a second pass over the finished path. The algorithm also
**ignores the EVA budget entirely**: the budget affects only where the
point-of-no-return marker falls, never the route.

---

## 6. Speed and time model

`web/js/eva.js`.

```
d        = 4 m  (orthogonal)   or   5.657 m (diagonal)
tanθ     = |Δz| / d
fSlope   = 1 / (1 + 1.5·tanθ)      uphill
         = 1 / (1 + 0.5·tanθ)      downhill
fTerrain = 1 / (1 + 0.48·R̂)       R̂ = rough8 / 255
v        = max(0.15, 1.2 · fSlope · fTerrain)
dt       = d / v
```

`v0 = 1.2 m/s` is a **suited analogue-mobility figure from Earth**. No human has
walked on Mars. A ±20% error on `v0` produces ±17% on time; combined with the
slope and terrain curves, the honest error bar on a 32-minute estimate is
roughly ±50%.

**Terrain penalty uses roughness only.** An earlier build derived `fTerrain`
from the cost raster, which already embeds slope — counting slope twice and
inflating walk time by about 14% (37 → 32 min for the reference route). The fix
was to export `rough8.png` and use it directly.

The 0.15 m/s floor prevents a division blow-up on pathological cells.

---

## 7. Environmental models

### 7.1 Surface temperature — modelled

```
ci = sin(alt)·cos(slope) + cos(alt)·sin(slope)·cos(az − aspect)
T  = −55 − 2.5·(z − z̄)/1000 + 30·(ci − mean(ci))
T  = gaussian_filter(T, σ = 3)        # ~12 m, human-scale surface temperature
```

Mapped to `temp8.png` over the 0.5–99.5 percentile range (−66.1 … −49.4 °C).
Distribution: p10 **−57.4 °C**, p50 **−54.7 °C**, p90 **−53.0 °C**.

**Limits.** One fixed sun angle (az 315°, alt 45°). Surface, not air. No diurnal
cycle, no seasons, terrestrial-style lapse rate. The model captures **spatial**
variation — about 17 °C across the box — and **no temporal** variation, while
REMS measures an **88 °C diurnal swing** at the same site. The layer is a
relative indicator of which ground is warmer, never an absolute temperature.

### 7.2 Radiation

```
dose = 0.64 mSv/day × (route duration in hours / 24)
```

`0.64 mSv/day` is the galactic cosmic ray background measured by RAD at Gale.
The career reference of **400 mSv is a conservative planning figure, not an
official NASA limit** (NASA's current limit is risk-based, around 600 mSv for
younger crew). Per-walk dose is small — 0.014 mSv for 32 minutes — which is
precisely why the cumulative framing matters more than any single EVA.

The **SEP toggle adds a flat +25 mSv** as a what-if. It is not derived from any
space-weather data and is not a forecast.

### 7.3 Thermal advisory — relative by construction

The box temperature distribution is computed once; its **10th percentile**
(−57.4 °C) is the threshold. Any route sample colder than that is flagged, and
the panel reports the fraction of the route in that coldest decile.

No absolute suit limit is asserted, because we have no defensible source for
one. A relative measure can say *"this is among the coldest ground you could
have chosen"* and cannot say *"this is unsafe"*. It is therefore an **advisory**,
not a gate.

---

## 8. Metric-by-metric rationale

Every value on screen, why it is there, and how far it should be trusted.

| # | Metric | Question it answers | Derivation | Class | Confidence |
|---|---|---|---|---|---|
| 1 | Sol / date | When are we operating? | REMS record sol 4995 | measured | exact |
| 2 | Air temp range | What will the crew breathe and feel? | REMS `min_temp`/`max_temp` | measured | exact as published |
| 3 | Ground temp range | How cold is the surface underfoot? | REMS `min_gts_temp`/`max_gts_temp` | measured | exact as published |
| 4 | Pressure | Suit pressure budget context | REMS `pressure` | measured | exact |
| 5 | Sky / opacity | Dust conditions for the EVA | REMS `atmo_opacity` | measured | categorical |
| 6 | UV index | Exposure hazard | REMS `local_uv_irradiance_index` | measured | categorical |
| 7 | Daylight | Usable window | REMS `sunrise`/`sunset` | measured | exact |
| 8 | Walk time | How long will this take? | §6 | **modelled** | **±50%** |
| 9 | Distance | How far is it? | Σ step lengths over 4 m grid | derived | ±1% |
| 10 | Max slope | Is any part too steep? | max `slope8` on the path | derived | −0/+3° (lower bound) |
| 11 | Ascent | How much climbing? | Σ positive Δz | derived | ±2 m |
| 12 | Descent | How much dropping? | Σ negative Δz | derived | ±2 m |
| 13 | Modelled surface temp | Warmer or colder ground? | §7.1 | **modelled** | relative only |
| 14 | Radiation dose | What does this walk cost in dose? | §7.2 | measured × modelled | ±50% |
| 15 | Dose % of reference | Is that a lot? | dose / 400 mSv | arithmetic | ±50% |
| 16 | Budget left | Can we still return? | budget − elapsed | arithmetic | inherits ±50% |
| 17 | PNR | Where must we turn around? | first index where 2·elapsed > budget | **modelled** | ±50% |
| 18 | Thermal advisory | Is any ground unusually cold? | §7.3 | **modelled** | relative only |
| 19 | Cursor lat/lon/elev | Where is this exactly? | grid geotransform | derived | ±1 m |
| 20 | Elevation profile | What is the shape of the walk? | `elev16` along path | derived | ±1–2 m |

### Why these and not others

- **Distance, slope, ascent, elevation** are shown because they are the only
  numbers here that are *exact* and they are the ones a crew can act on
  without trusting a model.
- **Walk time** is shown because it is the decision variable, and it is labelled
  as a model estimate because it is the weakest number on screen.
- **PNR** exists because returning is the constraint a rover never has to
  consider, and it makes the budget spatial rather than abstract.
- **Dose** is shown against a career reference rather than in isolation, because
  a per-walk figure of 0.014 mSv invites the wrong conclusion.
- **Thermal advisory** is relative because an absolute threshold would be
  invented.
- **Solve time** was displayed in an earlier build and removed — it is a
  developer metric with no meaning to a crew.

---

## 9. Constants register

| Constant | Value | Where | Provenance | If wrong |
|---|---|---|---|---|
| `v0_mps` | 1.2 m/s | §6 | suited analogue studies (Earth) | time scales linearly, ±50% |
| `slope_max_deg` | 25° | §4.3 | engineering choice | route stable 22–35° (§11) |
| `eva_budget_min` | 360 min | §6 | user-adjustable default | moves PNR only |
| `dose_rate_mSv_day` | 0.64 | §7.2 | MSL RAD at Gale | ±10% |
| `career_limit_mSv` | 400 | §7.2 | planning reference | % readout scales |
| `T_ref` | −55 °C | §7.1 | model choice | shifts temperature map |
| `lapse` | 2.5 K/km | §7.1 | terrestrial-style | temperature gradient |
| `amp` | 30 K | §7.1 | model choice | relief of warm/cold |
| sun az / alt | 315° / 45° | §4.2, §7.1 | cartographic convention | shadow direction |
| `σ` (temp smoothing) | 3 cells ≈ 12 m | §7.1 | noise suppression | texture of the layer |
| A\* `weight` | 1.15 | §5.3 | speed/optimality trade | up to 15% suboptimal |
| cost coeffs | 80 / 40 | §4.3 | design choice, 2:1 slope:roughness | route shape |
| `fTerrain` k | 0.48 | §6 | matches former roughness term | time scale |

---

## 10. Known interactions and defects

**Fixed during development**

1. **Slope double-counted.** The cost raster embeds slope, and `fTerrain` was
   originally derived from that cost, compounding the penalty. Walk time for the
   reference route was 37 min; after switching `fTerrain` to roughness only it
   is 32 min (−14%).
2. **Hardcoded mission sol.** A leftover `"Sol 214"` overwrote the REMS value in
   the header. Now derived from the record.
3. **Black edge column.** The warp left the last destination column unpainted;
   fixed by padding the source window 2 px.

**Still true, and disclosed**

4. **A\* ignores budget, radiation and temperature.** It optimises terrain cost
   only. The other constraints are reported, never enforced.
5. **PNR assumes retreat along the same path.** A crew would likely choose a
   different, possibly longer, escape.
6. **`wasted_s` and `max_grade_deg`** are computed and returned but never
   displayed. Harmless, currently unused.
7. **Two config constants were removed** — `sand_mult` and `boulder_mult` were
   declared but referenced by nothing; terrain penalties live in the cost raster.

---

## 11. Validation performed

| Check | Result |
|---|---|
| DEM scale | `1 px = 1.68706e-5° = 1.000 m` on `R = 3,396,190` |
| DEM completeness | 0.000% nodata; max mosaic seam 0.2 m |
| Route legality | **0** impassable cells on the generated path |
| Detour behaviour | 2.00 km route vs 1.73 km straight line = **1.16×** |
| Threshold sensitivity | see below |
| Thermal advisory | 0% of default route; **up to 27%** across 120 random routes |
| Browser | no console errors; click-to-place, drag, layer toggles, budget slider all exercised |

### Threshold sensitivity

Same endpoints, slope limit varied:

| Slope limit | Impassable | Route length | Detour | Terrain reachable |
|---|---|---|---|---|
| 18° | 12.3% | 2.27 km | 1.31× | 81.1% |
| 20° | 10.2% | 2.27 km | 1.31× | 88.4% |
| **25° (shipped)** | **5.9%** | **2.00 km** | **1.16×** | **93.5%** |
| 28° | 4.1% | 2.00 km | 1.16× | 95.6% |
| 30° | 3.0% | 1.98 km | 1.15× | 96.7% |
| 35° | 1.4% | 1.99 km | 1.15× | 98.6% |

Between 22° and 35° the route changes by about 1%. The result does not hinge on
the threshold; only the amount of terrain considered walkable changes materially.

---

## 12. Limitations and omissions

- **No spectral, geophysical or chemical data.** No CRISM, DAN, CheMin or APXS.
  Three of the eight data types the challenge suggests are absent.
- **No traverse validation.** Overlaying Curiosity's actual driven path is the
  strongest remaining check and has not been done.
- **No comms layer.** A viewshed implementation exists but produced a degenerate
  all-shadowed mask at 8 m sampling with a low observer. Excluded rather than
  shipped wrong.
- **4 m grid resolution floor.** Anything smaller than a cell is invisible.
- **Synthetic illumination.** Basemap shadows are the DEM hillshade, not the
  photograph's lighting.
- **CTX is ~5× coarser than the DEM** and panchromatic, with visible feather seams.
- **THEMIS is qualitative** and 25× coarser than the route grid.
- **REMS is one sol**, at the rover's position, from an outreach feed.
- **The route is a hypothesis about ground no human has stood on.**

---

## 13. Reproduction

```bash
python3 -m venv .venv
./.venv/bin/pip install -r pipeline/requirements.txt

# put the Mars Trek exports in data/raw/ as dtm.tif and ctx.tif
bash pipeline/run_all.sh              # full rebuild
# or, with no data at all:
./.venv/bin/python pipeline/99_stub.py   # synthetic terrain

./serve.sh                            # http://localhost:8000/web/
```

Products land in `data/out/`. `meta.json` is the contract between pipeline and
app: every raster shares its grid, so a pixel coordinate is the same everywhere.

---

## 14. References

- Gale crater DEM — NASA/JPL **Mars Trek**
- CTX mosaic — NASA/JPL-Caltech/MSSS, via **Mars Trek**
- THEMIS IR Day 100m Global Mosaic v12 — NASA/JPL/Arizona State University, via USGS Astrogeology
- MSL RAD — NASA/JPL/SwRI
- MSL REMS — NASA/JPL/Centro de Astrobiología (outreach feed)
- Hoffman, J. A., *EVA: Walking and Working in Space* — consulted for EVA consumables, thermal control and mobility limits. Not redistributed.
- Software: rasterio, pyproj, numpy, scipy, Pillow; A\* implemented from first principles, no routing library
- No NASA, JPL or mission logos are used anywhere in the product
