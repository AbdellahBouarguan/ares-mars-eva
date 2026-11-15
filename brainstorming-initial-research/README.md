# Initial research

Notes and reference material from the start of the project.

| File | What it is |
|---|---|
| `ideas.txt` | First brainstorm: the astronaut's role, candidate science objectives, the map layers we expected to need, and the resource links we started from |
| `scenario.txt` | Scratch file, empty |
| `Judge Briefing NASA Space Apps 2026.pdf` | The event's judge briefing, covering the rubric, the rule-outs, and the biases the panel is asked to correct for |

## Background reading

J. A. Hoffman, *EVA: Walking and Working in Space* (lecture slides).

We read this while scoping the project, before deciding what the planner should
compute. It is the reason consumables appear in the model at all. The talk makes
clear that what limits a spacewalk is oxygen, cooling and battery, not distance
travelled, and that is why A.R.E.S is built around a budget and a point of no
return instead of a route length.

Two smaller decisions came from the same source. Thermal control is treated as a
first-order problem, so surface temperature is on screen and the advisory is
measured against the terrain instead of an invented suit limit. Suit stiffness
limits mobility independently of gravity, so walking speed is derated by grade
and by surface roughness separately.

The document is third-party copyrighted material and is not redistributed in
this repository. It is cited in [`../README.md`](../README.md) and
[`../docs/methodology.md`](../docs/methodology.md).
