# Prior art (October 2026)

Is there an existing Mermaid → draw.io converter that keeps Mermaid's rendered
layout closely enough to use, fork or contribute to? Short answer: no, though
two come close in different ways.

## draw.io's own Mermaid import (draw.io desktop 32.4.1)

`draw.io.exe -x -f xml -o out.drawio in.mmd`, or Arrange > Insert > Mermaid.

Draw.io lays the diagram out with its **own Mermaid build**
(`js/mermaid/drawio-mermaid.min.js`, a jgraph `drawio-mermaid` module per the
app's changelog), not with the Mermaid that rendered the user's diagram. It
regenerates the diagram from source and produces native cells, honouring
`layout: elk` in frontmatter, with `mermaidId` attributes, `curved=1` edges
with waypoints, `exitX/entryX` ports, and `classDef`/`style` colours.

But it is not *the* rendered layout the user saw:

- Different Mermaid build and look (classic, not Mermaid 12's `neo`), and its
  own font (Trebuchet MS) and theme (`light-dark(#ECECFF,…)`), so node sizes
  differ and every position after them shifts. Example from
  `fixtures/basic.mmd`: "Start" is 95×54 in draw.io, 152×48 in Mermaid 12.2;
  the cylinder 80×67 vs 144×88.
- HTML labels are switched off (`htmlLabels=!1`), so formatting in labels is lost.
- The host app's theme (its page font, dark theme, export colours) is not
  known to draw.io at all; it only gets the `.mmd` text.

So an app's "Open in draw.io" button, sending the `.mmd`, gives a diagram with
the same structure and a similar shape, but a visibly different one.

## mmd2pptx (github.com/LJAYi/mmd2pptx, `@mmd2pptx/core` 0.2.4, Apache-2.0)

The closest prior art: it parses Mermaid's rendered SVG into an IR and exports
PPTX, SVG, draw.io and JSON Canvas. Its draw.io exporter keeps node geometry,
subgraphs as containers and waypoints. Not a good base for this, though:

- Labels are separate free-floating text cells, not the nodes' values: move a
  box in draw.io and its text stays behind; edge labels aren't attached to
  their edges either.
- Plain text only (no HTML labels); curves are flattened to straight
  waypoints (`rounded=0`).
- Targets Mermaid 11.16; Mermaid 12 changed the SVG (neo look, `data-points`).
- PowerPoint is the product (pptxgenjs, jszip, a web app, a GitHub broker), and
  it's pre-1.0. Fixing the label model would mean changing its IR, which is a
  redesign rather than a contribution.

Useful as a reference for shape mapping and endpoint resolution.

## Others

- mermaid-render-mcp: parses flowchart text and runs its own dagre layout with
  estimated text sizes; doesn't use the rendered SVG at all.
- No npm package found that turns a rendered Mermaid SVG into mxGraph XML.

## Decision

Build a small library: read the SVG Mermaid already rendered (so positions,
sizes, theme and HTML labels are exactly what the user saw), emit draw.io XML
where labels are the cells' own values and edges are connected to their nodes.
