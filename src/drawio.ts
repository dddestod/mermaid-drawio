/** A read diagram → draw.io's `<mxGraphModel>` XML. */
import { center, dropCollinear, nearestOnPolyline, type Point } from "./geometry.ts";
import type { Label } from "./labels.ts";
import type { Diagram, Edge, Vertex } from "./renderer.ts";
import { escapeXml, num, num4, styleString } from "./style.ts";

export function serialize(diagram: Diagram, options: { background?: string }): string {
  const { origin } = diagram;
  const out: string[] = [];
  const abs = (v: Vertex | undefined): Point => (v ? { x: v.box.x - origin.x, y: v.box.y - origin.y } : { x: 0, y: 0 });
  const parentId = (v: Vertex | undefined) => v?.cellId ?? "1";

  const vertexCell = (v: Vertex) => {
    const o = abs(v.parent);
    const x = v.box.x - origin.x - o.x;
    const y = v.box.y - origin.y - o.y;
    out.push(
      `<mxCell id="${escapeXml(v.cellId)}" value="${escapeXml(value(v.label))}" style="${escapeXml(styleString(v.style))}" vertex="1" parent="${escapeXml(parentId(v.parent))}">`,
      `  <mxGeometry x="${num(x)}" y="${num(y)}" width="${num(v.box.width)}" height="${num(v.box.height)}" as="geometry" />`,
      `</mxCell>`,
    );
  };

  const edgeCell = (e: Edge) => {
    const o = abs(e.parent);
    const local = (p: Point) => ({ x: p.x - origin.x - o.x, y: p.y - origin.y - o.y });
    const route = e.style.some(([k]) => k === "curved") ? e.points : dropCollinear(e.points);
    const waypoints = route.slice(1, -1).map(local);
    const terminals = `${e.source ? ` source="${escapeXml(e.source.cellId)}"` : ""}${e.target ? ` target="${escapeXml(e.target.cellId)}"` : ""}`;
    out.push(`<mxCell id="${escapeXml(e.cellId)}" value="${escapeXml(value(e.label))}" style="${escapeXml(styleString(e.style))}" edge="1" parent="${escapeXml(parentId(e.parent))}"${terminals}>`);
    let geometry = `  <mxGeometry`;
    let offset: Point | undefined;
    if (e.label) {
      // draw.io places a label at a fraction along the edge (-1 start … 1 end) plus an offset.
      const c = center(e.label.box);
      const { point, t } = nearestOnPolyline(c, route);
      geometry += ` x="${num4(2 * t - 1)}"`;
      offset = { x: c.x - point.x, y: c.y - point.y };
    }
    out.push(`${geometry} relative="1" as="geometry">`);
    if (!e.source) out.push(`    <mxPoint x="${num(local(route[0]).x)}" y="${num(local(route[0]).y)}" as="sourcePoint" />`);
    if (!e.target) out.push(`    <mxPoint x="${num(local(route[route.length - 1]).x)}" y="${num(local(route[route.length - 1]).y)}" as="targetPoint" />`);
    if (waypoints.length) {
      out.push(`    <Array as="points">`, ...waypoints.map((p) => `      <mxPoint x="${num(p.x)}" y="${num(p.y)}" />`), `    </Array>`);
    }
    if (offset && (Math.abs(offset.x) > 0.01 || Math.abs(offset.y) > 0.01)) out.push(`    <mxPoint x="${num(offset.x)}" y="${num(offset.y)}" as="offset" />`);
    out.push(`  </mxGeometry>`, `</mxCell>`);
    // Labels at the ends: children of the edge, so they move with it.
    for (const [i, t] of (e.terminals ?? []).entries()) {
      const end = t.end === "source" ? route[0] : route[route.length - 1];
      const c = center(t.label.box);
      const style = styleString([["edgeLabel", null], ["html", 1], ["resizable", 0], ["align", "center"], ["verticalAlign", "middle"], ...t.label.style, ["labelBackgroundColor", "none"]]);
      out.push(
        `<mxCell id="${escapeXml(`${e.cellId}-${t.end}${i ? `-${i + 1}` : ""}`)}" value="${escapeXml(value(t.label))}" style="${escapeXml(style)}" vertex="1" connectable="0" parent="${escapeXml(e.cellId)}">`,
        `  <mxGeometry x="${t.end === "source" ? -1 : 1}" relative="1" as="geometry">`,
        `    <mxPoint x="${num(c.x - end.x)}" y="${num(c.y - end.y)}" as="offset" />`,
        `  </mxGeometry>`,
        `</mxCell>`,
      );
    }
  };

  // Per parent: subgraphs (each followed by its contents), then edges, then nodes,
  // so edges are drawn over subgraph backgrounds but under nodes, as in Mermaid.
  const emit = (parent: Vertex | undefined) => {
    for (const c of diagram.vertices) {
      if (c.kind === "cluster" && c.parent === parent) {
        vertexCell(c);
        emit(c);
      }
    }
    for (const e of diagram.edges) if (e.parent === parent) edgeCell(e);
    for (const n of diagram.vertices) if (n.kind === "node" && n.parent === parent) vertexCell(n);
  };
  emit(undefined);

  const background = options.background ? ` background="${escapeXml(options.background)}"` : "";
  return [
    `<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"${background}>`,
    `  <root>`,
    `    <mxCell id="0" />`,
    `    <mxCell id="1" parent="0" />`,
    ...out.map((l) => `    ${l}`),
    `  </root>`,
    `</mxGraphModel>`,
  ].join("\n");
}

/**
 * A label's draw.io value: its HTML, with Mermaid's line height when it has
 * several lines and that differs from draw.io's (1.2).
 */
function value(label: Label | undefined): string {
  if (!label) return "";
  const lh = Math.round(label.lineHeight * 10) / 10;
  return label.lines > 1 && Math.abs(lh - 1.2) > 0.05 ? `<div style="line-height: ${lh}">${label.html}</div>` : label.html;
}
