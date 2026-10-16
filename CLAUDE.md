# mermaid-drawio

Converts a Mermaid flowchart's or state diagram's **rendered SVG** into draw.io XML, keeping
Mermaid's layout and styling. See README.md for the API and known differences,
and docs/research.md for why this exists (draw.io's own Mermaid import re-renders
with its own Mermaid, font and theme).

## Layout

- `src/index.ts`: API (`toDrawio`, `toMxGraphModel`, `svgStringToDrawio`), and the
  diagram type from `aria-roledescription` (flowcharts and state diagrams; others throw).
- `src/renderer.ts`: reader for Mermaid's shared renderer (flowchart, state, class,
  ER): nodes, clusters, edges (`data-points`), edge labels. Per-type id spellings and
  markers come from a `Dialect`; `src/flowchart.ts` is the flowchart one,
  `src/state.ts` the state one (composite states are swimlane containers).
- `src/drawio.ts`: the read diagram → `<mxGraphModel>` XML.
- `src/shapes.ts`: which draw.io shape a node outline is (from geometry; the SVG
  doesn't name shapes). Falls back to `mxgraph.basic.polygon`.
- `src/labels.ts`: HTML (foreignObject) and SVG-text labels → draw.io HTML values.
- `src/geometry.ts`, `src/style.ts`: transforms/boxes; colours, CSS → draw.io style.
- `fixtures/<name>.mmd` → `.svg` (rendered by `npm run fixtures`, Mermaid 12.2.0
  in headless Chromium, config in `scripts/mermaid-config.mjs`) → `.drawio`
  (expected output; file snapshots in `test/fixtures.test.ts`). A fixture without a
  `.drawio` is a type not supported yet, and the test expects it to be refused.
- `dev/`: Vite page, Mermaid beside draw.io's viewer of the conversion.

## Rules

- The SVG structure is Mermaid's internals: Mermaid stays pinned (exact version
  in devDependencies). Upgrading means re-rendering fixtures and reviewing the
  `.drawio` diffs (and screenshots via `scripts/compare.mjs`).
- No runtime dependencies. The library takes the SVG, never Mermaid itself.
- It needs a real DOM that measures (getBBox, getTotalLength, computed styles):
  tests run in Chromium via Vitest browser mode, not jsdom.
- Don't change `.drawio` fixtures by hand; update with `npx vitest run -u` after
  checking the change is intended (look at it in the dev page or draw.io).
- Check real draw.io too: with the desktop app installed,
  `draw.io -x -f png -o out/x.png fixtures/x.drawio` renders a file
  (on Windows: `"C:\Program Files\draw.io\draw.io.exe"`).
- Commit and push only when asked.
