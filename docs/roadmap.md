# Proposed roadmap

Status: proposal for discussion, not a release commitment. Updated 2026-10-16.

Expand mermaid-drawio beyond flowcharts while keeping its central promise:
turn the SVG Mermaid actually rendered into a useful, editable Draw.io diagram.
Prioritize ER and class diagrams, then state and sequence diagrams. Add further
families when demonstrated demand and prototype results justify the work.

## Goals

1. **Preserve the original rendering.** Retain geometry, labels, styles, groups,
   connections and relationship markers, within documented rendering limits.
2. **Make manual refinement practical.** Labels move with their objects,
   connectors remain attached, and related objects have useful grouping.
3. **Offer optional beautification.** Improve presentation without changing the
   diagram's meaning. Faithful conversion remains the default.
4. **Serve AI-assisted documentation.** Favor diagram types people are likely
   to generate from code, schemas, workflows and natural-language prompts.

## Current baseline

- The library supports Mermaid flowcharts, taking rendered SVG rather than
  parsing Mermaid source or choosing a replacement layout.
- The agent skill has faithful and explicit beautify modes, with Draw.io desktop
  PNG export and visual inspection of the final editable file.
- The skill uses its containing checkout and dependencies. It does not clone
  another converter or require a fixed Git commit.
- Mermaid 12.2.0 is pinned for development and fixture generation. The converter
  library has no runtime dependencies and requires real browser SVG measurement.
- The complete skill workflow has been validated on Windows. macOS/Linux tool
  discovery exists, but complete workflows remain untested on those platforms.

Only flowcharts are currently supported. This document does not advertise any
of the proposed types as implemented. See the [library README](../README.md) and
[skill setup guide](../skills/mermaid-drawio/SETUP.md) for current capabilities.

## How priorities were chosen

Scores combine expected AI-generated Mermaid demand, fidelity benefit, value
of manual editing, and estimated implementation and maintenance effort.
They are product judgments, not measured usage statistics, import-failure rates,
or promises about delivery time.

Architecture is both a diagram subject and a dedicated Mermaid syntax. An
architecture drawing written as `flowchart LR` already falls within existing
flowchart support; dedicated architecture and C4 adapters are separate work.

| Type | Priority / 10 | Proposed placement | Main rationale |
| --- | ---: | --- | --- |
| Flowchart | 10 | Maintain throughout | Existing core; improve fidelity and editing. |
| Entity relationship | 9 | Phase 1 | Schema generation plus valuable table arrangement. |
| Class | 9 | Phase 2 | Code documentation and editable compartments/relationships. |
| State | 8 | Phase 3 | Lifecycle modeling; reuse graph conversion foundations. |
| Sequence | 8 | Phase 4 | Strong expected demand; substantial specialized work. |
| Architecture | 6 | Phase 5 candidate | High manual-layout value; complex assets and grouping. |
| Mindmap | 6 | Phase 5 candidate | Branch balancing and visual hierarchy. |
| Block | 6 | Phase 5 candidate | Alignment and connector refinement. |
| Swimlanes | 6 | Phase 5 candidate | Cross-lane process arrangement. |
| C4 | 5 | Later candidate | Architectural boundaries; narrower incremental coverage. |
| Use case | 5 | Later candidate | Actors, boundaries and relationship placement. |

Deferred (scored 4 or lower): requirement, user journey, Gantt, timeline, event
modeling, kanban, git graph, quadrant, Ishikawa, TreeView, Wardley, Cynefin,
Venn, packet, Sankey, XY chart, radar, treemap and pie. Agentflow and railroad
(also in Mermaid 12.2) are unscored. ZenUML is an external Mermaid plugin and is
out of scope unless its sequence output is shown to differ in useful ways.

## Delivery model

Each type gets two independently reviewable milestones:

- **A: Faithful conversion.** Native editable objects, source appearance and
  geometry, correct relationships, and a verified Draw.io PNG export.
- **B: Optional beautification.** Type-specific presentation rules and semantic
  checks, enabled explicitly after faithful conversion is reliable.

A faithful milestone can be delivered without waiting for beautification. Keep
one agent skill with two modes; extend its supported-type matrix as individual
milestones pass validation. Do not create a separate skill for each diagram type.

## Phase 0: Establish the comparison baseline

Before building the first new adapter:

- Capture representative ER, class, state and sequence examples, including long
  labels, formatting, grouping, relationship markers and difficult layouts.
- Compare the original Mermaid render with Draw.io's built-in native import.
  Record source, configuration, fonts and application versions. Separate syntax
  failures, missing content, changed semantics and visual/layout differences.
- Add a support matrix that distinguishes faithful conversion, beautification
  and known unsupported constructs for each type.
- Confirm the internal extension points for reading a diagram family while
  reusing label measurement, transforms, styles and XML generation.
- Check which families Mermaid draws with the same unified renderer as
  flowcharts (recent Mermaid uses it for state, class and ER diagrams) and how
  much of the existing node/edge reading carries over. A family that mostly
  reuses it may move ahead of the scores; state is the likeliest candidate.

**Exit:** a reproducible comparison set and a scoped ER prototype plan. Use the
results to revise the priority scores where evidence warrants it. There is no
calendar schedule until the prototype clarifies implementation and review cost.

## Phase 1: Entity relationship diagrams

**Faithful milestone:** entities, names, attribute rows, keys/comments where
rendered, relationship labels, identifying/non-identifying line styles, and
cardinality markers at both ends. Preserve group membership where supported.

Entity contents should remain associated with their entity when moved. Moving
an entity must keep its relationships attached. Decide and document whether
individual attribute rows are editable cells or part of an editable entity
label; avoid promising row-level behavior before choosing a representation.

**Beautify milestone:** readable entity hierarchy, consistent table styling and
relationship-label treatment. Preserve attribute content and cardinalities.

**Exit:** small and dense schemas pass semantic checks, source/render comparison,
Draw.io export and a manual entity-move check.

## Phase 2: Class diagrams

**Faithful milestone:** class names, annotations, attributes, methods,
compartments, namespaces/groups where rendered, notes, relationship labels,
multiplicities and distinct UML endpoint markers.

Reuse proven ER table/compartment primitives where they fit. Keep explicit
type-specific handling for inheritance, realization, association, aggregation,
composition and dependency relationships.

**Beautify milestone:** clear name/member hierarchy and optional role styling,
with relationship types and member notation preserved.

**Exit:** representative inheritance and dependency graphs preserve content,
compartment geometry and endpoint meanings, including after manual movement.

## Phase 3: State diagrams

**Faithful milestone:** states, transition labels, initial/final states, choice
nodes, forks/joins, notes, composite states and concurrency regions. Document
partial coverage explicitly until all included constructs are validated.

**Beautify milestone:** restrained styling for state roles and nested regions,
without changing containment, transition direction or behavioral meaning.

**Exit:** flat and nested lifecycles, including retries and error paths, retain
correct grouping and transition attachments in Draw.io.

## Phase 4: Sequence diagrams

Start with a focused basic milestone: participants, lifelines, ordered messages,
arrow variants, self-messages and labels. Expand to activations, notes, numbered
messages, interaction frames, participant groups and creation/destruction.

Represent lifelines, messages and their attachments deliberately. Document
which manual edits preserve their relationships; ordinary free dragging is not
equally meaningful for every sequence element.

**Beautify milestone:** participant styling, frame hierarchy, typography and
message spacing, preserving message order and temporal relationships.

**Exit:** basic and advanced examples preserve participant/message associations,
arrow meanings, activations and frame nesting, with inspected desktop exports.

## Phase 5: Select the next family using evidence

Choose among the following after reviewing demand and the first four phases:

| Candidate | Main value | Feasibility questions |
| --- | --- | --- |
| Architecture | Service placement, boundaries and routing | Icons/assets, groups, junctions and ports. |
| Mindmap | Balance branches and adjust hierarchy | Radial geometry, connectors and branch grouping. |
| Block | Align and refine component diagrams | Spanning blocks, containers and connection behavior. |
| Swimlanes | Refine cross-role processes | Lane resizing, activity membership and cross-lane edges. |

C4 and use-case diagrams can follow when concrete requests justify their own
adapters. Phase 5 is a selection point, not a commitment to implement every
candidate. Treat architectural drawings already expressed as flowcharts as
flowcharts when evaluating incremental coverage.

## Acceptance criteria for every supported type

- **Content and semantics:** preserve labels, object identity, containment,
  connections, direction, relationship markers and type-specific meanings.
- **Appearance:** preserve positions, sizes, formatting, colors and routes in
  faithful mode. Document and demonstrate unavoidable rendering differences.
- **Editability:** moving an object keeps its text and intended connections
  associated with it. Check group movement and resizing where applicable.
- **Real export:** open or export the converted fixtures in Draw.io desktop and
  inspect them. A valid XML file or successful PNG export alone is
  insufficient. The skill's export workflow (including rerendering after a
  manual XML edit) is checked when the skill's supported types are extended.
- **Regression coverage:** add rendered SVG fixtures, XML expectations and
  meaningful semantic tests. Preserve existing flowchart behavior and APIs.
- **Documentation:** publish an accurate feature matrix, examples, limitations
  and tested platforms for the new capability.

Run the applicable existing checks:

```sh
npm run check
npm test
npm run test:skill
npm run test:skill:export
```

Use `npm run fixtures` and reviewed snapshot updates when fixture inputs or
conversion output intentionally change. Add checks for new adapters as needed;
the current test commands do not by themselves establish support for new types.

## Engineering boundaries

- Preserve the public rendered-SVG API and the library's lack of runtime
  dependencies. Keep Mermaid/browser/export tooling in development or helpers.
- Prefer small diagram-family adapters over replacing the converter wholesale.
  Extract shared abstractions when multiple implemented types demonstrate need.
- Continue pinning Mermaid and reviewing fixtures when upgrading it; its SVG
  structure is not a stable interchange contract.
- Keep faithful conversion separate from intentional presentation changes.
  The helper's local Mermaid rendering matches an external original only when
  the renderer version, configuration, fonts and assets also match.
- Do not silently omit unsupported constructs or present an embedded image as
  equivalent to independently editable objects. An image fallback would be a
  separately scoped, explicitly labeled capability.
- Retain checkout-relative discovery, overwrite protection, and the Windows
  `--force-device-scale-factor=1` export workaround.

Validate complete macOS/Linux workflows as a separate platform milestone before
claiming support. Track platform coverage independently of diagram coverage.

## Deferred work and decision points

The lower-scoring types remain deferred rather than rejected permanently.
Revisit them when there is a concrete user example, demonstrated import-fidelity
problem, a reusable adapter foundation, or demand that changes their value.

Reassess after ER/class and again after sequence support. Decide whether broader
type coverage or deeper fidelity/editability improvements would help users more.
Treat bug reports and real diagram samples as stronger evidence than the initial
scores. No publishing, push, release or date commitment follows from this proposal.

## Evidence and uncertainty

- [Mermaid diagram catalog](https://mermaid.js.org/intro/syntax-reference.html):
  diagram families and syntax references, not demand statistics.
- [GitHub Copilot diagram previews](https://github.blog/changelog/2025-03-17-instant-previews-flexible-editing-and-working-with-issues-in-copilot-chat-preview/):
  concrete AI-generation support for flowcharts and sequence diagrams.
- [Mermaid coding use cases](https://mermaid.ai/products/code): examples involving
  flowcharts, sequence, class, ER, architecture and C4 diagrams.
- [Existing project research](research.md): Draw.io re-lays out Mermaid source
  with its own Mermaid build, and the recorded flowchart differences.
  Cross-type fidelity rankings remain hypotheses until Phase 0 comparisons
  measure them.

No representative public distribution of LLM-generated diagram types was
established during planning. Expected demand and implementation effort remain
estimates and should be revised with usage evidence and prototype results.
