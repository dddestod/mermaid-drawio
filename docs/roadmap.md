# Roadmap

Status: a plan, not a commitment. Updated 2026-10-16.

The goal stays the same for every new diagram type: turn the SVG Mermaid
actually rendered into an editable draw.io diagram that looks like it, with
labels that move with their boxes and edges that stay attached. Editing happens
in draw.io; this project doesn't try to round-trip edits back to Mermaid.

Today flowcharts and state diagrams are supported (`UnsupportedDiagramError`
for the rest).

## Why this order

Mermaid 12.2 draws state, class and ER diagrams with the same renderer as
flowcharts, and sequence diagrams with a different one. A small sample of each
(rendered with the pinned Mermaid, default config):

| Type | `g.node` | Edge paths | With `data-points` | `g.edgeLabel` |
| --- | ---: | ---: | ---: | ---: |
| Flowchart | 3 | 2 | 2 | 1 |
| State | 5 | 4 | 4 | 1 |
| Class | 3 | 2 | 2 | 1 |
| ER | 2 | 1 | 1 | 1 |
| Sequence | 0 | 0 | 0 | 0 |

So state, class and ER are extensions of the flowchart reader, and sequence is
a separate reader. That decides the order more than demand estimates do.

## Step 0: split the shared reader out (no change in output)

- Split `src/index.ts` into a reader for Mermaid's shared renderer (nodes,
  clusters, edges with `data-points`, edge labels) and a flowchart layer on
  top, chosen by the SVG's `aria-roledescription`.
- Add one `.mmd` fixture per new type, so the next steps start from failing
  tests.

**Done when** every flowchart `.drawio` fixture is byte-identical, the API is
unchanged, and `npm test` and `npm run check` pass.

## Step 1: state diagrams (done)

- New shapes: start and end dots, fork/join bars, choice diamonds, notes.
- Composite states (and concurrency regions) as draw.io containers. In the
  sample, a composite state is not a `g.cluster`, so check how it's drawn first.
- Transitions and their labels should come through the shared reader.

**Done when** flat and nested lifecycles (with retries and error paths) keep
their containment, transition directions and labels, and moving a state in
draw.io keeps its transitions attached.

## Step 2: ER, then class

Both put rows inside a box (attributes; members and methods) and both rely on
edge-end markers, so they share most of the new code.

- **Rows.** Decide once, for both: one HTML label per box, or draw.io's
  table/stacked cells (each row editable on its own). Start with the HTML
  label, the simplest faithful option, and record the choice in the README.
- **Markers.** draw.io has matching built-in ends: `ERmandOne`, `ERmany`,
  `ERone`, `ERoneToMany`, `ERzeroToOne`, `ERzeroToMany` for ER; block (inheritance,
  realization), diamond (composition), open diamond (aggregation) and open
  arrow (association, dependency) for class. One marker mapping covers both.
- ER first (fewer relationship kinds), then class: annotations, namespaces,
  notes, multiplicities, solid and dashed links.

**Done when** small and dense schemas, and inheritance and dependency graphs,
keep row content, cardinalities and endpoint meanings, including after moving a
box in draw.io.

## Step 3: sequence diagrams, on request

A new reader: participants, lifelines, ordered messages, self-messages,
activations, notes and frames (`loop`, `alt`, `opt`). draw.io has `umlLifeline`
shapes, but little of the existing code applies. Start it when someone has a
real diagram that needs it.

## Every other type

Mindmap, block, architecture, C4, Gantt, timeline and the rest wait for a real
example where draw.io's own import falls short. Diagrams of an architecture
written as `flowchart` are already covered.

## Checklist for each type

1. Fixtures covering the type's constructs: `fixtures/<name>.mmd`, then
   `npm run fixtures`.
2. Reader and shape mapping, until the snapshots look right in the dev page.
3. Check in real draw.io (`draw.io -x -f png -o out/x.png fixtures/x.drawio`)
   and compare with Mermaid's render. While there, compare with draw.io's own
   Mermaid import, and note in docs/research.md what it gets wrong for this
   type.
4. Update the README: "What's kept", "Known differences" and the supported
   types.
5. Then the skill: accept the type in faithful mode; beautify styling for it
   comes later, as its own item.

Margin needs nothing extra: it falls back to draw.io's own import on
`UnsupportedDiagramError`, so each type reaches it on its next build.

## Boundaries

- The library keeps taking the rendered SVG, with no runtime dependencies.
- Mermaid stays pinned. Its SVG isn't a stable format, so an upgrade means
  re-rendering fixtures and reviewing every `.drawio` diff.
- Nothing is silently dropped: an unsupported construct is an error or a
  documented difference, never an embedded image passed off as editable.
- One type at a time. They all touch `src/index.ts` and `src/shapes.ts`.
- The skill workflow is tested on Windows only; macOS and Linux are a separate
  milestone.
