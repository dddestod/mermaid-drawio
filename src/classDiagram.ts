/**
 * Class diagrams on top of the shared renderer reader. Mermaid 12.2 draws a
 * class as a box with its annotation and name, then `g.divider` lines between
 * the members and methods: one cell, its sections in the label
 * (compartments.ts). Namespaces are clusters; notes and lollipop interfaces
 * are plain nodes.
 */
import type { Dialect, Vertex } from "./renderer.ts";
import type { Style } from "./style.ts";

export const classDiagram: Dialect = {
  nodeId,
  endpoints,
  marker,
  compartments: true,
  snapEnds: true,
};

/** `classId-<name>-<counter>` → the class's name (notes and interfaces keep theirs: `note0`, `interface0`). */
function nodeId(id: string): string {
  const m = /^classId-(.*)-\d+$/.exec(id);
  return m ? m[1] : id;
}

/** `id_<source>_<target>_<n>` → its two ends (names may contain `_`, so try each split). */
function endpoints(edgeId: string, byId: Map<string, Vertex>): [Vertex, Vertex] | undefined {
  const m = /^id_(.+)_\d+$/.exec(edgeId);
  if (!m) return undefined;
  const middle = m[1];
  for (let i = middle.indexOf("_"); i > 0; i = middle.indexOf("_", i + 1)) {
    const a = byId.get(middle.slice(0, i));
    const b = byId.get(middle.slice(i + 1));
    if (a && b) return [a, b];
  }
  return undefined;
}

/**
 * UML ends: inheritance and realization a hollow triangle, composition a
 * filled diamond, aggregation a hollow one, association and dependency an
 * open arrow, lollipop a hollow circle.
 */
function marker(url: string | null, end: "start" | "end"): Style {
  const name = url ?? "";
  const style = (arrow: string, fill: number, size: number): Style => [[`${end}Arrow`, arrow], [`${end}Fill`, fill], [`${end}Size`, size]];
  if (/extension/.test(name)) return style("block", 0, 14);
  if (/composition/.test(name)) return style("diamondThin", 1, 18);
  if (/aggregation/.test(name)) return style("diamondThin", 0, 18);
  if (/dependency/.test(name)) return style("open", 0, 10);
  if (/lollipop/.test(name)) return style("oval", 0, 12);
  return [[`${end}Arrow`, "none"]];
}
