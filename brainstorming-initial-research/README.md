# Initial research

Material from the start of the challenge, kept for transparency about how the
project was scoped.

| File | What it is |
|---|---|
| `ideas.txt` | First brainstorm: the astronaut role, candidate science objectives, the map layers we expected to need, and the resource links we started from |
| `scenario.txt` | Scratch file, empty |
| `Judge Briefing NASA Space Apps 2026.pdf` | The event's judge briefing — rubric, rule-outs, and the biases the panel is asked to correct for |

## Background reading

**J. A. Hoffman, _EVA: Walking and Working in Space_** (lecture slides).

We read this at the start to understand what extra-vehicular activity actually
involves before deciding what the planner should compute. It shaped three
choices in the final model:

- **Consumables are the binding constraint**, not distance — which is why the
  tool is built around an EVA budget and a point of no return rather than a
  simple route length.
- **Thermal control is a first-order problem**, which is why surface temperature
  appears at all, and why the thermal advisory is expressed relative to the
  terrain rather than against an invented suit limit.
- **Mobility is limited by suit stiffness, not just gravity**, which is why
  walking speed is derated by grade and by surface roughness separately.

The document is third-party copyrighted material and is **not redistributed**
in this repository. It is cited in [`../README.md`](../README.md) and
[`../docs/methodology.md`](../docs/methodology.md).
