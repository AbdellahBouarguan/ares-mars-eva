# A.R.E.S

**Advanced Regolith & Environmental Survivor.** A traverse planner for
extra-vehicular activity (EVA) on Mars.

Existing Mars maps answer *"what is this place?"* A.R.E.S answers a narrower
question: *"can the astronaut walk this route and get back?"*

Repository: <https://github.com/AbdellahBouarguan/ares-mars-eva>

Pick a start, pick a destination. The tool plans a route over a verified 1 m
digital elevation model of Gale Crater and reports the numbers that decide the
walk: time, consumables, radiation dose, and the point at which turning back is
no longer possible.

![Gale Crater terrain, 5.93 × 4.74 km working box](data/out/basemap.png)

## 2026 NASA Space Apps Challenge

This project was built for the 2026 NASA Space Apps Challenge, in response to
its brief on producing a layered, integrated view of a location or route on the
Martian surface that helps a human explorer plan and carry out a Marswalk.

Every dataset is NASA or NASA-derived, reached through the resources the
2026 NASA Space Apps Challenge recommends:

| Data | Source |
|---|---|
| Gale Crater DEM, 1 m | NASA/JPL **Mars Trek** |
| CTX mosaic, ~5 m | NASA/JPL-Caltech/MSSS, via **Mars Trek** |
| THEMIS IR Day 100 m mosaic | NASA/JPL/ASU, via USGS Astrogeology |
| MSL REMS weather, Sol 4995 | NASA/JPL/Centro de Astrobiología |
| MSL RAD dose rate | NASA/JPL/SwRI |

Per-dataset provenance, and the limitations of each: [`docs/data-manifest.csv`](docs/data-manifest.csv).

## Run it

Python 3.10 or newer is the only requirement. There is nothing to install, no
build step, and no network connection once the page has loaded.

```bash
git clone https://github.com/AbdellahBouarguan/ares-mars-eva.git
cd ares-mars-eva
./serve.sh
```

Open **http://localhost:8000/web/**. The rasters in `data/out/` are committed,
so the interface runs immediately. The clone is about 24 MB.

`serve.sh` copies `web/` and `data/out/` into a temporary directory before
serving, so the raw DEM, the virtualenv and the research folder are never
exposed. It binds all interfaces and prints the LAN address, which you can pass
to anyone on the same network.

On Windows without bash, run `python -m http.server 8000` from the repository
root and open `http://localhost:8000/web/`.

If the executable bit is missing, `bash serve.sh` does the same thing.

## Rebuild the data (optional)

Needed only if you change the pipeline or move the working box. The geospatial
stack is used exclusively by `pipeline/`; the web app imports none of it.

```bash
python3 -m venv .venv
./.venv/bin/pip install -r pipeline/requirements.txt
bash pipeline/run_all.sh
```

Rebuilding from source requires the raw Mars Trek exports described in
[`data/raw/README.md`](data/raw/README.md). With no raw data at all, synthetic
terrain is enough to bring the interface up:

```bash
./.venv/bin/python pipeline/99_stub.py
```

## Using it

| Action | How |
|---|---|
| Move the destination | click the map (the pill reads `PLACE B`) |
| Move the start | press `SET` next to A, then click |
| Fine-tune either point | drag the A or B marker |
| Change the EVA budget | drag the budget slider and watch the PNR marker move |
| Toggle layers | Terrain, THEMIS IR, surface temperature, steep terrain, route |
| Simulate a solar particle event | `SEP EVENT (sim)` |

The scroll wheel zooms and the map background pans. `RESET VIEW` returns to the
full box.

## What is on screen

| Readout | Class |
|---|---|
| Distance, max slope, ascent, descent, elevation profile | **derived geometry** over the DEM |
| Cursor latitude, longitude, elevation | derived |
| Sol, air temperature, ground temperature, pressure, sky, UV, daylight | **measured** (REMS) |
| Walk time, surface temperature, radiation dose, point of no return, thermal advisory | **model estimates** |

[`docs/methodology.md`](docs/methodology.md) §8 gives the formula, inputs and
error bar for each one.

## Repository layout

```
web/                             the app (plain ES modules, no dependencies)
  js/router.js                   weighted A* over the cost grid
  js/eva.js                      suit model: speed, time, temperature, dose, PNR
  js/app.js                      canvas map, endpoints, panels

pipeline/                        Python: raw rasters in, web products out
  config.json                    single source of truth
  01_grid.py … 08_themis.py      processing steps
  run_all.sh                     full rebuild

data/out/                        products the app loads (committed)
data/reference/Gale_DEM_8m.tif   whole 36 × 40 km extent at 8 m/px
data/raw/                        raw inputs (not committed, 5.4 GB)

docs/
  methodology.md                 the authoritative technical document
  data-manifest.csv              per-dataset provenance
  provenance.md                  data write-up and references

brainstorming-initial-research/  initial notes and reference material
```

## Model and limitations, in short

The DEM drives everything. Slope and roughness become a cost raster, and A\*
finds the cheapest path across it. Time is derived afterwards from a suited
walking speed of 1.2 m/s, derated by grade and by surface roughness. Dose is the
RAD background rate multiplied by duration. Thermal risk is expressed relative
to the box, because no defensible absolute suit limit exists.

The limits, stated plainly:

- **Walk time is the weakest number here.** Call it ±50%. No human has walked on
  Mars, so every speed constant is an Earth analogue.
- **A\* ignores the budget, radiation and temperature.** Those are reported, not
  enforced.
- **The temperature layer is modelled.** It captures spatial variation only and
  has no diurnal term. REMS measures an 88 °C swing at the same site.
- **No spectral, geophysical or chemical data** is included.
- **Nothing has been checked against Curiosity's actual traverse.** That remains
  the most useful validation available.

The full treatment is in [`docs/methodology.md`](docs/methodology.md) §10–§12.

## AI assistance

This project used generative AI tools for code drafting, documentation and
debugging. No AI-generated imagery is used anywhere, and every scientific
claim, constant and limitation was verified against its source. The full
statement, including which tools and what they were used for, is in
[`docs/ai-usage.md`](docs/ai-usage.md).

## Credits

Mars data: NASA/JPL, NASA/JPL-Caltech/MSSS, NASA/JPL/Arizona State University,
NASA/JPL/SwRI, NASA/JPL/Centro de Astrobiología, and USGS Astrogeology.

Background reading: J. A. Hoffman, *EVA: Walking and Working in Space*. We read
it while scoping the project to understand what extra-vehicular activity
involves, and it shaped the decision to model consumables and thermal load at
all. It is not redistributed here.

No NASA, JPL or mission logos are used anywhere in this project.
