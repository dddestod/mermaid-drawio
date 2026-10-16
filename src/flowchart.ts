/** Flowcharts on top of the shared renderer reader: their id spellings and arrowheads. */
import type { Dialect, Vertex } from "./renderer.ts";
import type { Style } from "./style.ts";

export const flowchart: Dialect = {
  edgeSelector: "path.flowchart-link",
  nodeId,
  endpoints,
  marker,
};

/** `flowchart-<node id>-<counter>` → node id. */
function nodeId(id: string): string {
  const m = /^flowchart-(.*)-\d+$/.exec(id);
  return m ? m[1] : id;
}

/** `L_<source>_<target>_<n>` → its two ends (ids may contain `_`, so try each split). */
function endpoints(edgeId: string, byId: Map<string, Vertex>): [Vertex, Vertex] | undefined {
  const m = /^L_(.+)_\d+$/.exec(edgeId);
  if (!m) return undefined;
  const middle = m[1];
  for (let i = middle.indexOf("_"); i > 0; i = middle.indexOf("_", i + 1)) {
    const a = byId.get(middle.slice(0, i));
    const b = byId.get(middle.slice(i + 1));
    if (a && b) return [a, b];
  }
  return undefined;
}

function marker(url: string | null, end: "start" | "end"): Style {
  const name = url ?? "";
  const kind = /point/i.test(name) ? "block" : /circle/i.test(name) ? "oval" : /cross/i.test(name) ? "cross" : "none";
  const size = kind === "block" ? 8 : 9;
  return kind === "none"
    ? [[`${end}Arrow`, "none"]]
    : [[`${end}Arrow`, kind], [`${end}Fill`, kind === "cross" ? 0 : 1], [`${end}Size`, size]];
}
