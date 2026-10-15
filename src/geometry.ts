/** Points, boxes and transforms in the root SVG's user space (its viewBox coordinates). */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The transform from `el`'s own user space to the root `<svg>`'s, from the
 * `transform` attributes on the way up. Mermaid only uses translations, but
 * any matrix works. Doesn't depend on how (or whether) the SVG is laid out on
 * the page, unlike getScreenCTM.
 */
export function toRoot(el: Element, root: SVGSVGElement): DOMMatrix {
  const chain: Element[] = [];
  for (let e: Element | null = el; e && e !== root; e = e.parentElement) chain.push(e);
  let m = new DOMMatrix();
  for (let i = chain.length - 1; i >= 0; i--) {
    const t = (chain[i] as SVGGraphicsElement).transform?.baseVal.consolidate();
    if (t) m = m.multiply(t.matrix);
    // A foreignObject's own x/y offset its contents (Mermaid leaves them at 0).
    if (i > 0 && chain[i] instanceof SVGForeignObjectElement) {
      const fo = chain[i] as SVGForeignObjectElement;
      m = m.translate(fo.x.baseVal.value, fo.y.baseVal.value);
    }
  }
  return m;
}

export const apply = (m: DOMMatrix, p: Point): Point => {
  const q = m.transformPoint(new DOMPoint(p.x, p.y));
  return { x: q.x, y: q.y };
};

export function boundsOf(points: Point[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** `el`'s bounding box in root coordinates. */
export function boxInRoot(el: SVGGraphicsElement, root: SVGSVGElement): Box {
  let b: Box;
  if (el instanceof SVGForeignObjectElement) {
    // getBBox on a foreignObject is its x/y/width/height, but read them directly
    // so labels work even when the SVG isn't rendered.
    b = { x: el.x.baseVal.value, y: el.y.baseVal.value, width: el.width.baseVal.value, height: el.height.baseVal.value };
  } else {
    const r = el.getBBox();
    b = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  const m = toRoot(el, root);
  return boundsOf([
    apply(m, { x: b.x, y: b.y }),
    apply(m, { x: b.x + b.width, y: b.y }),
    apply(m, { x: b.x, y: b.y + b.height }),
    apply(m, { x: b.x + b.width, y: b.y + b.height }),
  ]);
}

export const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

export const contains = (outer: Box, p: Point, slack = 0.5) =>
  p.x >= outer.x - slack && p.x <= outer.x + outer.width + slack && p.y >= outer.y - slack && p.y <= outer.y + outer.height + slack;

export const containsBox = (outer: Box, inner: Box, slack = 0.5) =>
  contains(outer, { x: inner.x, y: inner.y }, slack) &&
  contains(outer, { x: inner.x + inner.width, y: inner.y + inner.height }, slack);

/** Distance from `p` to the outline of box `b` (0 on the outline, positive inside or out). */
export function distanceToBoxEdge(p: Point, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height));
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(p.x - b.x, b.x + b.width - p.x, p.y - b.y, b.y + b.height - p.y);
}

/** Drop repeated points (Mermaid's paths often repeat a corner). */
export function dedupe(points: Point[], eps = 0.01): Point[] {
  return points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > eps);
}

/** Drop middle points of straight runs. */
export function dropCollinear(points: Point[], eps = 0.01): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    while (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const len = Math.hypot(p.x - a.x, p.y - a.y) || 1;
      // b is on the line a→p and between them.
      const between = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) >= 0;
      if (Math.abs(cross) / len < eps && between) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}

/** Ramer–Douglas–Peucker simplification of an open polyline. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const a = points[0];
  const b = points[points.length - 1];
  let worst = -1;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], a, b);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  return Math.hypot(p.x - closestOnSegment(p, a, b).x, p.y - closestOnSegment(p, a, b).y);
}

function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * The point on `line` nearest `p`, and how far along the line it is (0 at the
 * start, 1 at the end): what draw.io needs to place an edge label.
 */
export function nearestOnPolyline(p: Point, line: Point[]): { point: Point; t: number } {
  const lengths = line.slice(1).map((q, i) => Math.hypot(q.x - line[i].x, q.y - line[i].y));
  const total = lengths.reduce((s, l) => s + l, 0);
  let best = { point: line[0], t: 0, d: Infinity };
  let walked = 0;
  for (let i = 0; i < lengths.length; i++) {
    const q = closestOnSegment(p, line[i], line[i + 1]);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.d) {
      const along = walked + Math.hypot(q.x - line[i].x, q.y - line[i].y);
      best = { point: q, t: total === 0 ? 0.5 : along / total, d };
    }
    walked += lengths[i];
  }
  return { point: best.point, t: best.t };
}
