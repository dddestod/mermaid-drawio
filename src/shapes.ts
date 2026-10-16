/**
 * Which draw.io shape draws a Mermaid node's outline. Mermaid's SVG doesn't
 * name the shape, so it's read from the geometry: the element type, polygon
 * corners, or (for paths) points sampled along the outline. Anything that
 * matches no draw.io shape becomes a polygon with the same outline.
 */
import { apply, boundsOf, dedupe, simplify, toRoot, type Box, type Point } from "./geometry.ts";
import { drawioColor, num, resolvePaint, type Style } from "./style.ts";

export interface Shape {
  /** The outline's bounding box in root coordinates: the cell's geometry. */
  box: Box;
  style: Style;
  /** The parts whose paint the cell takes, when not all of them (default: every painted part). */
  painted?: SVGGraphicsElement[];
}

const EPS = 0.02; // in fractions of the box
const PX = 1.5; // how far (px) a sampled outline may stray from a template

export function classifyShape(el: SVGGraphicsElement, root: SVGSVGElement, all: SVGGraphicsElement[]): Shape {
  const m = toRoot(el, root);
  if (el instanceof SVGRectElement) {
    const box = rectBox(el, m);
    const rx = Math.min(el.rx.baseVal.value || el.ry.baseVal.value, box.width / 2, box.height / 2);
    return { box, style: rx > 0.01 ? roundedStyle(rx, box) : [["rounded", 0]] };
  }
  if (el instanceof SVGCircleElement || el instanceof SVGEllipseElement) {
    const box = boxOf(el, m);
    const inner = all.find((e) => e !== el && (e instanceof SVGCircleElement || e instanceof SVGEllipseElement));
    if (!inner) return { box, style: [["ellipse", null]] };
    // draw.io's `margin` is the gap between the two rings.
    const gap = (box.width - boxOf(inner, toRoot(inner, root)).width) / 2;
    return { box, style: [["ellipse", null], ["shape", "doubleEllipse"], ["margin", num(gap)]] };
  }
  if (el instanceof SVGPolygonElement || el instanceof SVGPolylineElement) {
    const points = dedupe(Array.from(el.points, (p) => apply(m, p)));
    return polygonShape(points);
  }
  if (el instanceof SVGPathElement) {
    const cylinder = cylinderShape(el, m);
    if (cylinder) return cylinder;
    return outlineShape(sampleOutline(el, m));
  }
  // A group (Mermaid wraps some outlines in <g class="label-container">): classify what's inside.
  const inner = Array.from(el.querySelectorAll<SVGGraphicsElement>("rect, circle, ellipse, polygon"));
  if (inner.length) return classifyShape(inner[0], root, inner);
  const path = el.querySelector("path");
  if (path) return bullseye(el, path, root) ?? outlineShape(sampleOutline(path, toRoot(path, root)));
  return { box: boxOf(el, m), style: [["rounded", 0]] };
}

function rectBox(el: SVGRectElement, m: DOMMatrix): Box {
  const x = el.x.baseVal.value;
  const y = el.y.baseVal.value;
  const w = el.width.baseVal.value;
  const h = el.height.baseVal.value;
  return boundsOf([apply(m, { x, y }), apply(m, { x: x + w, y: y + h })]);
}

function boxOf(el: SVGGraphicsElement, m: DOMMatrix): Box {
  const b = el.getBBox();
  return boundsOf([apply(m, { x: b.x, y: b.y }), apply(m, { x: b.x + b.width, y: b.y + b.height })]);
}

/** A rounded rectangle with corner radius `r` (a stadium when r is half the height). */
function roundedStyle(r: number, box: Box): Style {
  if (r >= Math.min(box.width, box.height) / 2 - 0.5) return [["rounded", 1], ["arcSize", 50]];
  return [["rounded", 1], ["absoluteArcSize", 1], ["arcSize", num(r * 2)]];
}

const near = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps;

function polygonShape(points: Point[]): Shape {
  if (points.length > 2 && near(points[0].x, points[points.length - 1].x, 0.01) && near(points[0].y, points[points.length - 1].y, 0.01)) {
    points = points.slice(0, -1);
  }
  const box = boundsOf(points);
  const n = points.map((p) => ({ x: (p.x - box.x) / (box.width || 1), y: (p.y - box.y) / (box.height || 1) }));
  const at = (x: number, y: number) => n.some((p) => near(p.x, x) && near(p.y, y));
  const unique = uniquePoints(n);

  if (unique.length === 4 && at(0.5, 0) && at(1, 0.5) && at(0.5, 1) && at(0, 0.5)) {
    return { box, style: [["rhombus", null]] };
  }
  const top = unique.filter((p) => near(p.y, 0)).map((p) => p.x).sort((a, b) => a - b);
  const bottom = unique.filter((p) => near(p.y, 1)).map((p) => p.x).sort((a, b) => a - b);
  if (unique.length === 4 && top.length === 2 && bottom.length === 2) {
    const [tl, tr] = top;
    const [bl, br] = bottom;
    if (near(tl, 0) && near(tr, 1) && near(bl, 0) && near(br, 1)) return { box, style: [["rounded", 0]] };
    if (near(tr - tl, br - bl)) {
      // Parallelogram: draw.io's leans right (top shifted right); flip for the other way.
      const size = Math.abs(tl - bl) * box.width;
      return { box, style: [["shape", "parallelogram"], ["perimeter", "parallelogramPerimeter"], ["fixedSize", 1], ["size", num(size)], ...(tl < bl ? [["flipH", 1] as [string, number]] : [])] };
    }
    if (near(tl, 1 - tr) && near(bl, 1 - br)) {
      // Trapezoid: draw.io's is narrow at the top; flip for narrow at the bottom.
      const size = Math.abs(tl - bl) * box.width;
      return { box, style: [["shape", "trapezoid"], ["perimeter", "trapezoidPerimeter"], ["fixedSize", 1], ["size", num(size)], ...(tl < bl ? [["flipV", 1] as [string, number]] : [])] };
    }
  }
  if (unique.length === 6 && at(0, 0.5) && at(1, 0.5) && top.length === 2 && bottom.length === 2 && near(top[0], bottom[0]) && near(top[0], 1 - top[1])) {
    return { box, style: [["shape", "hexagon"], ["perimeter", "hexagonPerimeter2"], ["fixedSize", 1], ["size", num(top[0] * box.width)]] };
  }
  // Subroutine ([[text]]): a rectangle with an inner line near each side, drawn as one polygon.
  const xs = [...new Set(unique.map((p) => Math.round(p.x * 1000)))].sort((a, b) => a - b).map((x) => x / 1000);
  if (unique.every((p) => near(p.y, 0) || near(p.y, 1)) && xs.length === 4 && near(xs[0], 0) && near(xs[3], 1) && near(xs[1], 1 - xs[2])) {
    return { box, style: [["shape", "process"], ["backgroundOutline", 1], ["fixedSize", 1], ["size", num(xs[1] * box.width)]] };
  }
  return { box, style: polyStyle(n) };
}

function uniquePoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) if (!out.some((q) => near(p.x, q.x, 0.001) && near(p.y, q.y, 0.001))) out.push(p);
  return out;
}

/** draw.io's free-form polygon, in fractions of the box. */
function polyStyle(n: Point[]): Style {
  const coords = n.map((p) => `[${num4(p.x)},${num4(p.y)}]`).join(",");
  return [["shape", "mxgraph.basic.polygon"], ["polyCoords", `[${coords}]`], ["polyline", 0]];
}

const num4 = (n: number) => String(Math.round(n * 10000) / 10000);

/** Mermaid's cylinder ([(text)]): a path of elliptical arcs and vertical lines. */
function cylinderShape(el: SVGPathElement, m: DOMMatrix): Shape | undefined {
  const d = el.getAttribute("d") ?? "";
  const arcs = [...d.matchAll(/a\s*([\d.]+)[\s,]+([\d.]+)/gi)];
  if (arcs.length < 3 || /[cqs]/i.test(d)) return undefined;
  const ry = parseFloat(arcs[0][2]);
  const box = boxOf(el, m);
  // draw.io's cylinder3 `size` is the depth of the top ellipse below the top edge: its radius.
  return { box, style: [["shape", "cylinder3"], ["boundedLbl", 1], ["backgroundOutline", 1], ["size", num(ry)]] };
}

/** Points along a path's first subpath (its outline), in root coordinates. */
function sampleOutline(path: SVGPathElement, m: DOMMatrix): Point[] {
  const d = path.getAttribute("d") ?? "";
  // Only the first subpath: Mermaid's sketchy outlines repeat strokes after an M.
  const first = /^\s*[Mm][^Mm]*/.exec(d)?.[0] ?? d;
  let sample = path;
  if (first.length < d.length) {
    sample = path.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    sample.setAttribute("d", first);
    path.parentNode!.insertBefore(sample, path);
  }
  try {
    const total = sample.getTotalLength();
    const count = Math.min(400, Math.max(40, Math.ceil(total / 2)));
    const points: Point[] = [];
    for (let i = 0; i <= count; i++) points.push(apply(m, sample.getPointAtLength((total * i) / count)));
    return dedupe(points);
  } finally {
    if (sample !== path) sample.remove();
  }
}

/**
 * A ring around a smaller filled dot, drawn as paths (a state diagram's end
 * state): an ellipse with draw.io's centre dot (`centerRadius`, `centerColor`).
 */
function bullseye(el: SVGGraphicsElement, ring: SVGPathElement, root: SVGSVGElement): Shape | undefined {
  const dot = el.querySelector<SVGPathElement>(":scope > g path");
  if (!dot) return undefined;
  const outer = outlineShape(sampleOutline(ring, toRoot(ring, root)));
  // (A circle also fits the stadium template, which is tried first.)
  const round = outer.style.some(([k, v]) => k === "ellipse" || (k === "arcSize" && v === 50 && Math.abs(outer.box.width - outer.box.height) <= PX));
  // The dot is too small to tell from a square by its outline: a smaller box on the same centre will do.
  const dotBox = boxOf(dot, toRoot(dot, root));
  if (!round || dotBox.width >= outer.box.width * 0.75) return undefined;
  const c = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  if (Math.hypot(c(outer.box).x - c(dotBox).x, c(outer.box).y - c(dotBox).y) > PX) return undefined;
  const dotFill = drawioColor(resolvePaint(getComputedStyle(dot).fill, dot)).color;
  return {
    box: outer.box,
    style: [["ellipse", null], ["centerRadius", num(dotBox.width / 2)], ["centerColor", dotFill]],
    painted: Array.from(el.querySelectorAll<SVGGraphicsElement>(":scope > path")),
  };
}

/** A sampled outline as the draw.io shape it matches, else as a polygon. */
function outlineShape(points: Point[]): Shape {
  const box = boundsOf(points);
  const { width: w, height: h } = box;
  const fits = (distance: (p: Point) => number) => points.every((p) => distance(p) <= PX);
  const local = (p: Point) => ({ x: p.x - box.x - w / 2, y: p.y - box.y - h / 2 });
  const roundRect = (r: number) => (p: Point) => {
    const q = local(p);
    const ax = Math.abs(q.x) - (w / 2 - r);
    const ay = Math.abs(q.y) - (h / 2 - r);
    const outside = Math.hypot(Math.max(ax, 0), Math.max(ay, 0));
    return Math.abs(outside + Math.min(Math.max(ax, ay), 0) - r);
  };
  if (fits(roundRect(0))) return { box, style: [["rounded", 0]] };
  if (fits(roundRect(Math.min(w, h) / 2))) return { box, style: [["rounded", 1], ["arcSize", 50]] };
  const ellipse = (p: Point) => {
    const q = local(p);
    return Math.abs(Math.hypot(q.x / (w / 2), q.y / (h / 2)) - 1) * Math.min(w, h) / 2;
  };
  if (fits(ellipse)) return { box, style: [["ellipse", null]] };
  const closed = [...points, points[0]];
  const outline = simplify(closed, 0.75).slice(0, -1);
  const shape = polygonShape(outline);
  return shape;
}
