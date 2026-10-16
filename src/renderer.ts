/**
 * Reader for Mermaid 12.2's shared renderer, which draws flowchart, state,
 * class and ER diagrams alike: nodes (`g.node`), clusters (`g.cluster`), edge
 * paths with their routed points in `data-points`, and edge labels
 * (`g.edgeLabel`). What differs per diagram type (how ids are spelled, which
 * markers mean what) comes from a {@link Dialect}.
 */
import {
  apply,
  boxInRoot,
  center,
  containsBox,
  dedupe,
  distanceToBoxEdge,
  distanceToSegment,
  toRoot,
  type Box,
  type Point,
} from "./geometry.ts";
import { readLabel, type Label } from "./labels.ts";
import { classifyShape } from "./shapes.ts";
import { dashPattern, drawioColor, num, num4, px, resolvePaint, type Style } from "./style.ts";

export interface Vertex {
  /** Mermaid's id for the node or subgraph. */
  id: string;
  cellId: string;
  kind: "node" | "cluster";
  box: Box;
  style: Style;
  label?: Label;
  parent?: Vertex;
}

export interface Edge {
  id: string;
  cellId: string;
  source?: Vertex;
  target?: Vertex;
  points: Point[];
  style: Style;
  label?: Label;
  parent?: Vertex;
}

export interface Diagram {
  origin: Point;
  vertices: Vertex[];
  edges: Edge[];
}

/** What a diagram type adds to the shared reader. */
export interface Dialect {
  /** Edge paths beyond the shared `path[data-edge='true'], g.edgePaths > path`. */
  edgeSelector?: string;
  /** A node's DOM id (without the `<svg id>-` prefix) → the diagram's id for it. */
  nodeId(domId: string): string;
  /** An edge's id → its two ends, when the id names them. */
  endpoints(edgeId: string, byId: Map<string, Vertex>): [Vertex, Vertex] | undefined;
  /** A `marker-start`/`marker-end` URL → draw.io's arrow style for that end. */
  marker(url: string | null, end: "start" | "end"): Style;
}

export function readDiagram(svg: SVGSVGElement, dialect: Dialect): Diagram {
  const prefix = svg.id ? `${svg.id}-` : "";
  const vb = svg.viewBox.baseVal;
  const origin = vb && vb.width ? { x: vb.x, y: vb.y } : { x: 0, y: 0 };
  const cellIds = new Set<string>();
  const cellId = (base: string) => {
    let id = base.replace(/[^\w.:-]/g, "_");
    for (let i = 2; cellIds.has(id); i++) id = `${base}-${i}`;
    cellIds.add(id);
    return id;
  };

  const clusters: Vertex[] = Array.from(svg.querySelectorAll<SVGGElement>("g.cluster"), (g) => {
    const id = stripPrefix(g.id, prefix);
    const rect = g.querySelector<SVGRectElement>(":scope > rect") ?? g.querySelector<SVGGraphicsElement>("rect, path, polygon");
    if (!rect) return undefined;
    const label = readLabel(g.querySelector(".cluster-label") ?? g, svg);
    const box = boxInRoot(rect, svg);
    const style: Style = [["container", 1], ["collapsible", 0], ["recursiveResize", 0], ...shapeColours([rect]), ...labelStyle(label, box, "cluster")];
    const rx = rect instanceof SVGRectElement ? rect.rx.baseVal.value : 0;
    style.unshift(rx > 0 ? ["rounded", 1] : ["rounded", 0]);
    if (rx > 0) style.splice(1, 0, ["absoluteArcSize", 1], ["arcSize", num(rx * 2)]);
    return { id, cellId: cellId(`cluster-${id}`), kind: "cluster" as const, box, style, label };
  }).filter((v) => v !== undefined);

  const nodes: Vertex[] = Array.from(svg.querySelectorAll<SVGGElement>("g.node"), (g) => {
    const id = dialect.nodeId(stripPrefix(g.id, prefix));
    const parts = Array.from(g.children).filter(
      (c): c is SVGGraphicsElement => c instanceof SVGGraphicsElement && !c.classList.contains("label") && c.tagName !== "text",
    );
    const main = parts.find((p) => p.classList.contains("label-container") || p.classList.contains("outer-circle")) ?? parts[0];
    const label = readLabel(g.querySelector(":scope > .label") ?? g, svg);
    if (!main) {
      // A bare label (e.g. a text-only node).
      if (!label) return undefined;
      return { id, cellId: cellId(`node-${id}`), kind: "node" as const, box: label.box, style: [["text", null] as Style[number], ...labelStyle(label, label.box, "node")], label };
    }
    const shape = classifyShape(main, svg, parts);
    const painted = main instanceof SVGGElement ? Array.from(main.querySelectorAll<SVGGraphicsElement>("path, rect, polygon, circle, ellipse")) : parts;
    const style: Style = [...shape.style, ...shapeColours(painted), ...labelStyle(label, shape.box, "node", shape.style.some(([k]) => k === "boundedLbl"))];
    return { id, cellId: cellId(`node-${id}`), kind: "node" as const, box: shape.box, style, label };
  }).filter((v) => v !== undefined);

  // Subgraph membership from geometry: the smallest subgraph around each box.
  for (const v of [...clusters, ...nodes]) {
    let best: Vertex | undefined;
    for (const c of clusters) {
      if (c === v || !containsBox(c.box, v.box)) continue;
      if (v.kind === "cluster" && area(c.box) <= area(v.box)) continue;
      if (!best || area(c.box) < area(best.box)) best = c;
    }
    v.parent = best;
  }

  const byId = new Map<string, Vertex>();
  for (const v of [...clusters, ...nodes]) if (!byId.has(v.id)) byId.set(v.id, v);
  const vertices = [...clusters, ...nodes];

  const labels = new Map<string, Label>();
  for (const g of svg.querySelectorAll("g.edgeLabel")) {
    const inner = g.querySelector("[data-id]");
    const label = readLabel(g, svg);
    if (inner && label) labels.set(inner.getAttribute("data-id")!, label);
  }

  const edges: Edge[] = [];
  const edgeSelector = ["path[data-edge='true'], g.edgePaths > path", dialect.edgeSelector].filter(Boolean).join(", ");
  for (const path of svg.querySelectorAll<SVGPathElement>(edgeSelector)) {
    if (edges.some((e) => e.id === path.getAttribute("data-id"))) continue;
    const id = path.getAttribute("data-id") ?? stripPrefix(path.id, prefix);
    const points = edgePoints(path, svg);
    if (points.length < 2) continue;
    const ends = dialect.endpoints(id, byId);
    const source = ends?.[0] ?? nearestVertex(points[0], vertices);
    const target = ends?.[1] ?? nearestVertex(points[points.length - 1], vertices);
    const label = labels.get(id);
    const style = edgeStyle(path, points, source, target, dialect, label);
    edges.push({ id, cellId: cellId(`edge-${id}`), source, target, points, style, label, parent: commonParent(source, target) });
  }
  return { origin, vertices, edges };
}

const area = (b: Box) => b.width * b.height;

function stripPrefix(id: string, prefix: string): string {
  return prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function nearestVertex(p: Point, vertices: Vertex[]): Vertex | undefined {
  let best: Vertex | undefined;
  let bestD = 8;
  for (const v of vertices) {
    const d = Math.abs(distanceToBoxEdge(p, v.box));
    // Prefer nodes over the subgraph around them.
    if (d < bestD || (d === bestD && v.kind === "node")) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

function ancestors(v: Vertex | undefined): Vertex[] {
  const out: Vertex[] = [];
  for (let p = v?.parent; p; p = p.parent) out.push(p);
  return out;
}

/** The innermost subgraph holding both ends (draw.io keeps an edge there, so it moves with it). */
function commonParent(a: Vertex | undefined, b: Vertex | undefined): Vertex | undefined {
  const bs = new Set(ancestors(b));
  return ancestors(a).find((p) => bs.has(p) && p !== a && p !== b);
}

/**
 * The edge's route in root coordinates. Mermaid 12 keeps the routed points,
 * before curving, in `data-points` (base64 JSON); otherwise use the path's own
 * on-curve points.
 */
function edgePoints(path: SVGPathElement, svg: SVGSVGElement): Point[] {
  const m = toRoot(path, svg);
  const data = path.getAttribute("data-points");
  let points: Point[] | undefined;
  if (data) {
    try {
      points = (JSON.parse(atob(data)) as Point[]).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    } catch {
      points = undefined;
    }
  }
  if (!points) {
    const d = path.getAttribute("d") ?? "";
    points = [...d.matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)].map((x) => ({ x: +x[1], y: +x[2] }));
  }
  // With dagre, an edge to a subgraph is routed to a node inside it and only
  // the drawn path is cut at the subgraph's border: cut the points there too.
  if (points.length >= 2) {
    const length = path.getTotalLength();
    points = trimTo(points, path.getPointAtLength(0));
    points = trimTo(points.reverse(), path.getPointAtLength(length)).reverse();
  }
  return dedupe(points.map((p) => apply(m, p)));
}

/** If `points` starts well away from `start` (where the path is drawn from), start there instead. */
function trimTo(points: Point[], start: Point): Point[] {
  const gap = (p: Point) => Math.hypot(p.x - start.x, p.y - start.y);
  // Mermaid insets the drawn ends for arrowheads by a few px; that's not a cut.
  if (gap(points[0]) <= 12) return points;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(start, points[i], points[i + 1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return [{ x: start.x, y: start.y }, ...points.slice(best + 1)];
}

function edgeStyle(path: SVGPathElement, points: Point[], source: Vertex | undefined, target: Vertex | undefined, dialect: Dialect, label?: Label): Style {
  const cs = getComputedStyle(path);
  const d = path.getAttribute("d") ?? "";
  const curved = /C/i.test(d);
  const rounded = !curved && /Q/i.test(d);
  const style: Style = [["edgeStyle", "none"], curved ? ["curved", 1] : ["rounded", rounded ? 1 : 0]];
  if (rounded) style.push(["arcSize", 10]);
  style.push(["html", 1]);
  const width = px(cs.strokeWidth, 1);
  const stroke = drawioColor(resolvePaint(cs.stroke, path));
  const invisible = width === 0 || path.classList.contains("edge-thickness-invisible");
  style.push(["strokeColor", invisible ? "none" : stroke.color], ["strokeWidth", invisible ? 1 : width]);
  if (stroke.opacity !== undefined) style.push(["opacity", stroke.opacity]);
  // Mermaid's own dash array on the path animates/insets the line; the pattern classes say the style.
  const dash = path.classList.contains("edge-pattern-dotted") ? "2 2" : path.classList.contains("edge-pattern-dashed") ? "3 3" : undefined;
  if (dash) style.push(["dashed", 1], ["dashPattern", dash], ["fixDash", 1]);
  style.push(...dialect.marker(path.getAttribute("marker-start"), "start"), ...dialect.marker(path.getAttribute("marker-end"), "end"));
  if (invisible) style.push(["startArrow", "none"], ["endArrow", "none"]);
  style.push(...port(points[0], source, "exit"), ...port(points[points.length - 1], target, "entry"));
  if (label) {
    style.push(...label.style);
    style.push(["labelBackgroundColor", label.background ?? "none"]);
  }
  return style;
}

/** Pin the edge's end where Mermaid put it, as a fraction of the node's box. */
function port(p: Point, v: Vertex | undefined, which: "exit" | "entry"): Style {
  if (!v || v.box.width === 0 || v.box.height === 0) return [];
  const fx = (p.x - v.box.x) / v.box.width;
  const fy = (p.y - v.box.y) / v.box.height;
  return [[`${which}X`, num4(fx)], [`${which}Y`, num4(fy)], [`${which}Dx`, 0], [`${which}Dy`, 0], [`${which}Perimeter`, 0]];
}

/** Fill, stroke and shadow from the painted parts of a shape. */
function shapeColours(parts: SVGGraphicsElement[]): Style {
  const styles = parts.map((p) => getComputedStyle(p));
  const fills = styles.map((cs, i) => resolvePaint(cs.fill, parts[i]));
  const strokes = styles.map((cs, i) => resolvePaint(cs.stroke, parts[i]));
  const fillAt = fills.findIndex((f) => drawioColor(f).color !== "none");
  const strokeAt = strokes.findIndex((s, i) => drawioColor(s).color !== "none" && px(styles[i].strokeWidth, 1) > 0);
  const strokeCs = styles[strokeAt] as CSSStyleDeclaration | undefined;
  const fill = drawioColor(fills[fillAt]);
  const stroke = drawioColor(strokes[strokeAt]);
  const style: Style = [["fillColor", fill.color]];
  if (fill.opacity !== undefined) style.push(["fillOpacity", fill.opacity]);
  style.push(["strokeColor", stroke.color], ["strokeWidth", strokeCs ? px(strokeCs.strokeWidth, 1) : 1]);
  if (stroke.opacity !== undefined) style.push(["strokeOpacity", stroke.opacity]);
  const dash = dashPattern(strokeCs?.strokeDasharray);
  if (dash) style.push(["dashed", 1], ["dashPattern", dash], ["fixDash", 1]);
  if (styles.some((cs) => /drop-shadow/.test(cs.filter))) style.push(["shadow", 1]);
  return style;
}

/**
 * Label placement inside a node or subgraph: wrap at Mermaid's label width,
 * and keep its vertical offset (e.g. a cylinder's label sits low).
 */
function labelStyle(label: Label | undefined, box: Box, kind: "node" | "cluster", bounded = false): Style {
  const style: Style = [["html", 1], ["whiteSpace", "wrap"]];
  if (!label) return style;
  style.push(...label.style);
  const side = Math.max(0, (box.width - label.box.width) / 2);
  style.push(["spacing", 0], ["spacingLeft", num(side)], ["spacingRight", num(side)]);
  if (kind === "cluster") {
    style.push(["verticalAlign", "top"], ["spacingTop", num(label.box.y - box.y)]);
  } else if (!bounded) {
    // (A cylinder's label already sits below its top: boundedLbl.)
    const dy = center(label.box).y - center(box).y;
    if (Math.abs(dy) > 0.5) style.push(dy > 0 ? ["spacingTop", num(2 * dy)] : ["spacingBottom", num(-2 * dy)]);
  }
  return style;
}
