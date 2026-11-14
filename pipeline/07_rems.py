"""Fetch one sol of REMS weather at Gale and write data/out/rems.json.

Source: NASA/JPL/CAB outreach feed for MSL REMS.
    https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json

The feed states it is intended for outreach; scientific REMS data lives in
the PDS. We credit it as such.

Usage: python pipeline/07_rems.py [--sol 4995]
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text())
OUT = ROOT.parent / CFG["out_dir"]
OUT.mkdir(parents=True, exist_ok=True)

API = "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"

sol = 4995
if "--sol" in sys.argv:
    sol = int(sys.argv[sys.argv.index("--sol") + 1])


def num(v, cast=float):
    try:
        return cast(v)
    except (TypeError, ValueError):
        return None


def main() -> int:
    req = urllib.request.Request(API, headers={"User-Agent": "Wayfinder/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        payload = json.loads(resp.read())

    soles = payload.get("soles", [])
    if not soles:
        raise SystemExit("REMS feed returned no soles")

    rec = next((s for s in soles if num(s.get("sol"), int) == sol), None)
    if rec is None:
        rec = soles[0]
        print(f"sol {sol} not in feed, using latest sol {rec['sol']}")
    else:
        print(f"using sol {rec['sol']} ({rec.get('terrestrial_date')})")

    out = {
        "sol": num(rec.get("sol"), int),
        "terrestrial_date": rec.get("terrestrial_date"),
        "ls": num(rec.get("ls"), int),
        "season": rec.get("season"),
        "air_temp_min_c": num(rec.get("min_temp")),
        "air_temp_max_c": num(rec.get("max_temp")),
        "ground_temp_min_c": num(rec.get("min_gts_temp")),
        "ground_temp_max_c": num(rec.get("max_gts_temp")),
        "pressure_pa": num(rec.get("pressure"), int),
        "pressure_trend": rec.get("pressure_string"),
        "opacity": rec.get("atmo_opacity"),
        "uv_index": rec.get("local_uv_irradiance_index"),
        "sunrise": rec.get("sunrise"),
        "sunset": rec.get("sunset"),
        "source": "REMS, MSL/Curiosity",
        "credit": "NASA/JPL/CAB",
        "url": API,
        "note": "Published by CAB as an outreach feed. For scientific REMS "
                "data use the PDS Atmospheres node.",
    }
    (OUT / "rems.json").write_text(json.dumps(out, indent=2))

    gmin, gmax = out["ground_temp_min_c"], out["ground_temp_max_c"]
    swing = (gmax - gmin) if None not in (gmin, gmax) else None
    print(f"air {out['air_temp_min_c']}..{out['air_temp_max_c']} C   "
          f"ground {gmin}..{gmax} C" + (f"  (swing {swing:.0f} C)" if swing else ""))
    print(f"{out['pressure_pa']} Pa   {out['opacity']}   UV {out['uv_index']}   "
          f"{out['sunrise']}-{out['sunset']}")
    print("wrote data/out/rems.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
