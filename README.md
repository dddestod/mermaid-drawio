# mermaid-drawio

Turn a Mermaid flowchart into an editable draw.io diagram **that looks like the
one Mermaid drew**: same positions, sizes, shapes, colours, subgraphs, edge
routes and labels.

draw.io can import Mermaid itself, but it renders the source again with its
own copy of Mermaid, its own font and theme, and without HTML labels, so the
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
- Throws `UnsupportedDiagramError` for anything but a flowchart.

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
- Flowcharts only, for now.

## Mermaid version

This reads Mermaid's SVG, which isn't a stable format. Tested against
**Mermaid 12.2.0** (pinned in devDependencies); the fixtures pin down what the
converter expects. When upgrading Mermaid: `npm run fixtures`, `npm test`, and
look at the diffs.

## Status and support

I wrote this for my own use and share it as-is. Bug reports are welcome. I may be slow to reply or may not reply at all.
Pull requests are currently disabled. If you need a change, feel free to fork it.

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
