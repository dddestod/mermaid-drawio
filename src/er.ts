/**
 * ER diagrams on top of the shared renderer reader. Mermaid 12.2 draws an
 * entity as a box with its name over `row-rect-odd`/`row-rect-even` rows and
 * `g.divider` column lines (type, name, keys, comment): one cell, its rows in
 * the label (compartments.ts). Relationship ends are crow's-foot markers,
 * which draw.io has as its ER arrows.
 */
import type { Dialect, Vertex } from "./renderer.ts";
import type { Style } from "./style.ts";

export const er: Dialect = {
  nodeId,
  endpoints,
  marker,
  compartments: true,
};

/** `entity-<name>-<counter>` → the entity's name. */
function nodeId(id: string): string {
  const m = /^entity-(.*)-\d+$/.exec(id);
  return m ? m[1] : id;
}

/** `id_<source DOM id>_<target DOM id>_<n>` → its two ends (names may contain `_`, so try each split). */
function endpoints(edgeId: string, byId: Map<string, Vertex>): [Vertex, Vertex] | undefined {
  const m = /^id_(.+)_\d+$/.exec(edgeId);
  if (!m) return undefined;
  const middle = m[1];
  for (let i = middle.indexOf("_"); i > 0; i = middle.indexOf("_", i + 1)) {
    const a = byId.get(nodeId(middle.slice(0, i)));
    const b = byId.get(nodeId(middle.slice(i + 1)));
    if (a && b) return [a, b];
  }
  return undefined;
}

/** Mermaid's cardinality markers → draw.io's ER arrows (the same four ends). */
const ENDS: Array<[RegExp, string]> = [
  [/onlyOne/, "ERmandOne"],
  [/zeroOrOne/, "ERzeroToOne"],
  [/oneOrMore/, "ERoneToMany"],
  [/zeroOrMore/, "ERzeroToMany"],
];

function marker(url: string | null, end: "start" | "end"): Style {
  const kind = ENDS.find(([re]) => re.test(url ?? ""))?.[1];
  return kind ? [[`${end}Arrow`, kind], [`${end}Fill`, 0], [`${end}Size`, 12]] : [[`${end}Arrow`, "none"]];
}
