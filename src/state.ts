/**
 * State diagrams (`stateDiagram-v2`) on top of the shared renderer reader.
 *
 * Mermaid 12.2 draws a composite state as `g.statediagram-cluster` (a title
 * band over its body: `rect.outer` and `rect.inner`) and each concurrency
 * region (`--`) as another one with a dashed `rect.divider`. Notes are nodes
 * (`g.statediagram-note`); the `g.note-cluster` drawn around a note and its
 * state is only a layout group and isn't read.
 */
import type { Dialect } from "./renderer.ts";
import type { Style } from "./style.ts";

export const state: Dialect = {
  clusterSelector: "g.statediagram-cluster",
  nodeId,
  clusterId: nodeId,
  // Transition ids (`edge0`, `edge1`, …) don't name their ends: the reader
  // attaches each end to the state its route starts or ends on.
  endpoints: () => undefined,
  marker,
};

/** `state-<name>-<counter>` → the state's name (`root_start`, `Running_end` for the [*] dots). */
function nodeId(id: string): string {
  const m = /^state-(.*)-\d+$/.exec(id);
  return m ? m[1] : id;
}

/** Transitions end in `stateDiagram-barbEnd` (a notched arrowhead); note links have none. */
function marker(url: string | null, end: "start" | "end"): Style {
  return /barbEnd/.test(url ?? "") ? [[`${end}Arrow`, "classic"], [`${end}Fill`, 1], [`${end}Size`, 8]] : [[`${end}Arrow`, "none"]];
}
