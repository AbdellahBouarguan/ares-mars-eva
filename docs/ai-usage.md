# AI assistance

This project was built for the 2026 NASA Space Apps Challenge, which permits
generative AI tools. This page records what we used and what we did with it.

## Tools

| Tool | Used for |
|---|---|
| ChatGPT (OpenAI) | early scoping, documentation drafts, wording |
| Claude (Anthropic) | documentation structure and editorial review |
| Gemini (Google) | background research, cross-checking explanations |
| Codex (OpenAI) | code generation and refactoring in the pipeline and the front end |

We used several tools for speed, and so that explanations could be checked
against each other before trusting them.

## What the tools helped with

- drafting and refactoring the Python pipeline and the browser-side JavaScript
- drafting documentation, later revised for accuracy and tone
- suggesting debugging approaches when the pipeline or the renderer misbehaved
- summarising background material while we were choosing a site and a science
  objective

## What they did not do

No AI-generated imagery, texture or video appears in the product or the demo.
Every image is NASA data or a render of NASA data. No NASA, JPL or mission
branding is generated or reproduced.

No scientific claim, constant or limitation was accepted without being traced
either to a dataset or to a stated assumption.

## How the output was checked

Each dataset was verified against its source before use: the DEM for scale,
projection, nodata and seams; the CTX mosaic against the same box; THEMIS and
REMS through their published services. Every displayed metric is classified as
measured, derived or modelled in
[`methodology.md`](methodology.md), with its assumptions listed. Where a number
could not be defended it was removed or labelled an estimate.

## Tooling note

The 2026 NASA Space Apps Challenge submission form asks teams to declare this
separately. The list there matches the table above.
