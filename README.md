# mermaid-drawio

Turn a Mermaid flowchart, state, ER or class diagram into an editable draw.io diagram
**that looks like the one Mermaid drew**: same positions, sizes, shapes,
colours, subgraphs, edge routes and labels.

draw.io can import Mermaid itself, but it lays the source out again with its
own Mermaid build, its own font and theme, and without HTML labels, so the
result is laid out differently from what you saw (see
[docs/research.md](docs/research.md)). This library reads the SVG Mermaid has
already rendered instead.

```ts
import mermaid from "mermaid";
import { svgStringToDrawio, toDrawio } from "mermaid-drawio";

const { svg } = await mermaid.render("d1", code);
const xml = svgStringToDrawio(svg, { pageName: "My diagram" }); // contents of a .drawio file

// or, for an SVG already on the page:
const xml2 = toDrawio(document.querySelector("svg")!);
```

Runs in a browser (or any real DOM that can measure SVG: getBBox, computed
styles). Not in jsdom.

## API

- `toDrawio(svg: SVGSVGElement, options?) → string`: a `.drawio` file
  (`<mxfile>`, uncompressed).
- `toMxGraphModel(svg, options?) → string`: just the `<mxGraphModel>`.
- `svgStringToDrawio(markup, options?) → string`: from `mermaid.render`'s
  markup; renders it off-screen for the call.
- Options: `pageName` (default "Page-1"), `background` (page colour, e.g. for a
  dark theme's light text).
- Throws `UnsupportedDiagramError` for anything but a flowchart, a state
  diagram (`stateDiagram-v2`), an ER diagram or a class diagram.

## What's kept

- **Nodes**: position and size; shape (rectangle, rounded, stadium, subroutine,
  cylinder, circle, double circle, rhombus, hexagon, parallelograms,
  trapezoids; anything else becomes a draw.io polygon with the same outline);
  fill, stroke, stroke width, dashes, shadow (Mermaid 12's "neo" look) from
  the theme, `classDef` and `style`.
- **Labels**: as the cell's own HTML value (so they move with the box), with
  bold/italic/code etc. kept, Mermaid's wrap width and line height, font,
  size and colour. Mermaid's SVG-text labels (`htmlLabels: false`) too.
- **Subgraphs**: draw.io containers, nested; nodes are their children.
- **State diagrams**: start dots, end dots (ring and centre dot), fork/join
  bars, choice diamonds, notes and their dashed links, rounded states, with
  `classDef` colours. Composite states are draw.io swimlanes (Mermaid's title
  band, body and bottom strip) with their states as children; concurrency
  regions (`--`) are dashed containers inside them. Transitions are connected
  to their states (composites included), self-loops too, with their labels.
- **ER diagrams**: each entity is one cell, with its rows in the cell's label:
  an HTML table under the name (type, name, keys and comment columns, Mermaid's
  row stripes and divider lines), so the whole entity moves and resizes as one
  box. Entities without attributes are plain boxes. Relationships keep their
  cardinalities as draw.io's ER ends (`ERmandOne`, `ERzeroToOne`,
  `ERoneToMany`, `ERzeroToMany`), solid or dashed (non-identifying), with
  their labels; self-relationships too. `style` and `classDef` colours.
- **Class diagrams**: each class is one cell, with its annotation
  (`«interface»`), name, members and methods in the label, in sections split
  by Mermaid's divider lines; static members stay underlined and abstract ones
  italic. Namespaces are containers, notes are notes, and a lollipop interface
  is its name as text. Relations keep their ends (hollow triangle for
  inheritance and realization, filled and hollow diamonds for composition and
  aggregation, open arrow for association and dependency, circle for
  lollipop), dashes, labels, and multiplicities (`"1"`, `"*"`) as labels at
  the edge's ends that move with it.
- **Titles** (`title:` in the front matter): a text cell where Mermaid put it.
- **Edges**: connected to their nodes, pinned to the exact points Mermaid
  attached them, with Mermaid's route as waypoints. Rounded corners (ELK) →
  `rounded=1`; spline curves (dagre) → `curved=1`. Arrowheads (arrow, circle,
  cross, both ends), thickness, dotted/dashed, `linkStyle` colours, labels
  (placed where Mermaid put them, with their background).

## Known differences

- draw.io's curved style is a different spline from Mermaid's, so curves bend
  slightly differently.
- Circle arrowheads sit centred on the node's edge rather than just outside it.
- Text may wrap at a slightly different point in skewed shapes
  (parallelograms), where draw.io insets the label area itself.
- Gradient borders (Mermaid 12's base and dark themes) become a solid border
  in the gradient's start colour (the theme's `primaryBorderColor`).
- State diagrams: a wrapped note or label may break at a different word, since
  Mermaid's wrapping counts a trailing space at the end of a line and draw.io's
  doesn't. The end dot uses draw.io's `centerRadius` (recent draw.io; older
  versions draw only the ring). Arrowheads touch the state where Mermaid
  stops them a few pixels short. Concurrency regions have generated ids, so
  their cell ids change between renders.
- ER and class rows are one label per box (the [roadmap](docs/roadmap.md)
  weighed this against a cell per row). Edit a row as text; in an ER table,
  draw.io's table tools (in the text toolbar while editing) add or delete
  rows. The box doesn't grow by itself: resize it, or use Arrange > Autosize.
  Relationships attach to the box, not to a row (as in Mermaid).
- ER relationship labels have an opaque background in draw.io; Mermaid's is
  translucent, so its line shows faintly through the label.
- Class relation ends touch the class box. With Mermaid's default (ELK)
  layout, Mermaid leaves a small gap before some arrowheads.
- Flowcharts, state, ER and class diagrams only, for now (sequence diagrams
  are next, on request).

## Mermaid version

This reads Mermaid's SVG, which isn't a stable format. Tested against
**Mermaid 12.2.0** (pinned in devDependencies); the fixtures pin down what the
converter expects. When upgrading Mermaid: `npm run fixtures`, `npm test`, and
look at the diffs.

## Status and support

I wrote this for my own use and share it as-is. Bug reports are welcome. I may be slow to reply or may not reply at all.
Pull requests are currently disabled. If you need a change, feel free to fork it.

Not affiliated with or endorsed by JGraph (draw.io) or the Mermaid project.

See the [roadmap](docs/roadmap.md) for which diagram types come next
(sequence, on request) and how each is checked. It is a plan, not a commitment.

## Agent skill

The [Mermaid to Draw.io skill](skills/mermaid-drawio/README.md) creates editable
diagrams and PNG previews using this checkout and Draw.io desktop. Conversion
is faithful by default (flowcharts, state, ER and class diagrams);
beautification is an explicit mode, for flowcharts. See the
[setup guide](skills/mermaid-drawio/SETUP.md) for installation, dependencies,
usage and platform support.

## Development

```bash
npm install
npx playwright install chromium
npm test              # converts fixtures/*.svg in Chromium, compares with fixtures/*.drawio
npm run dev           # http://localhost:5199: a diagram beside draw.io's view of the conversion
npm run fixtures      # re-render fixtures/*.mmd → fixtures/*.svg with the pinned Mermaid
node scripts/compare.mjs [name…] [--dagre]   # screenshots of the dev page into out/
```

After an intended change in output, review the diff and update the expected
files with `npx vitest run -u`.
