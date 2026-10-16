/**
 * Boxes with rows inside (ER entities, classes) as one draw.io cell whose
 * label lays the rows out: the header, then bands split where Mermaid draws
 * a row or divider line, and, where vertical dividers cross a band (ER
 * attribute columns), a table row with one cell per column. Editing a row is
 * editing text; draw.io's table tools add or remove ER attribute rows.
 */
import { boxInRoot, center, type Box } from "./geometry.ts";
import { readLabel, type Label } from "./labels.ts";
import { drawioColor, num, px, resolvePaint, type Style } from "./style.ts";

interface Line {
  y: number;
  x: number;
  colour: string;
  width: number;
}

interface Band {
  top: number;
  bottom: number;
  fill?: string;
  /** The line along the band's top, unless it's the box's own border. */
  border?: { colour: string; width: number };
}

interface Text {
  label: Label;
  underline: boolean;
  /** In a list of members or methods: left-aligned however wide. */
  listed: boolean;
}

/**
 * The rows of a node drawn with `row-rect-*` rows or `g.divider` lines, as a
 * label filling the cell; undefined for a node without them.
 */
export function readCompartments(g: SVGGElement, box: Box, svg: SVGSVGElement, colours: Style): { label: Label; style: Style } | undefined {
  const paint0 = new Map(colours);
  const fill = String(paint0.get("fillColor"));
  // Keep the rows inside the box's own border (draw.io draws the label over it).
  const inset = paint0.get("strokeColor") === "none" ? 0 : Number(paint0.get("strokeWidth") ?? 1) / 2;
  const rows = Array.from(g.querySelectorAll<SVGGElement>(":scope > g[class^='row-rect']"));
  const dividers = Array.from(g.querySelectorAll<SVGGElement>(":scope > g.divider"));
  if (!rows.length && !dividers.length) return undefined;

  const across: Line[] = [];
  const down: Array<Line & { top: number; bottom: number }> = [];
  for (const d of dividers) {
    const path = stroked(d);
    if (!path) continue;
    const b = boxInRoot(path, svg);
    const line = { ...paint(path), x: b.x + b.width / 2, y: b.y + b.height / 2 };
    if (b.height < 2 && b.width > 2) across.push(line);
    else if (b.width < 2 && b.height > 2) down.push({ ...line, top: b.y, bottom: b.y + b.height });
  }
  const rowBoxes = rows.map((r) => {
    const body = r.querySelector<SVGGraphicsElement>("path, rect")!;
    const edge = stroked(r);
    return { box: boxInRoot(body, svg), fill: drawioColor(resolvePaint(getComputedStyle(body).fill, body)).color, line: edge ? paint(edge) : undefined };
  });

  // Band edges: the box, each row's top and bottom, each horizontal divider.
  const ys = [box.y, box.y + box.height, ...rowBoxes.flatMap((r) => [r.box.y, r.box.y + r.box.height]), ...across.map((l) => l.y)].sort((a, b) => a - b);
  const edges = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 1);
  const bands: Band[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const top = edges[i];
    const bottom = edges[i + 1];
    if (top < box.y - 1 || bottom > box.y + box.height + 1) continue;
    const row = rowBoxes.find((r) => Math.abs(r.box.y - top) <= 1 && Math.abs(r.box.y + r.box.height - bottom) <= 1);
    const divider = across.find((l) => Math.abs(l.y - top) <= 1);
    const line = top > box.y + 1 ? divider ?? rowBoxes.find((r) => Math.abs(r.box.y - top) <= 1 || Math.abs(r.box.y + r.box.height - top) <= 1)?.line : undefined;
    bands.push({ top, bottom, fill: row && row.fill !== fill ? row.fill : undefined, border: line });
  }

  const texts: Text[] = [];
  for (const el of g.querySelectorAll<SVGGElement>("g.label")) {
    const label = readLabel(el, svg);
    if (label && label.box.width > 0) texts.push({ label, underline: /underline/.test(getComputedStyle(el).textDecorationLine), listed: !!el.closest(".members-group, .methods-group") });
  }
  const base = texts[0]?.label.style ?? [];
  const baseFont = new Map(base);

  const parts: string[] = [];
  let table: string[] = [];
  const flush = () => {
    if (table.length) parts.push(`<table style="width:100%;border-collapse:collapse;table-layout:fixed">${table.join("")}</table>`);
    table = [];
  };
  for (const [b, band] of bands.entries()) {
    if (b === bands.length - 1) band.bottom -= inset;
    const inBand = texts.filter((t) => center(t.label.box).y >= band.top && center(t.label.box).y < band.bottom);
    const height = band.bottom - band.top;
    const xs = down.filter((l) => l.top <= band.top + 1 && l.bottom >= band.bottom - 1).sort((a, b) => a.x - b.x);
    const border = band.border ? `border-top:${lineCss(band.border)};` : "";
    const background = band.fill ? `background:${band.fill};` : "";
    if (xs.length) {
      const columns = [box.x + inset, ...xs.map((l) => l.x), box.x + box.width - inset];
      const cells = columns.slice(0, -1).map((left, i) => {
        const right = columns[i + 1];
        const mine = inBand.filter((t) => center(t.label.box).x >= left && center(t.label.box).x < right);
        const pad = mine.length ? Math.min(...mine.map((t) => t.label.box.x)) - left : 0;
        const padTop = mine.length ? Math.min(...mine.map((t) => t.label.box.y)) - band.top : 0;
        const side = i > 0 ? `border-left:${lineCss(xs[i - 1])};` : "";
        const style = `box-sizing:border-box;width:${num(right - left)}px;padding:${num(padTop)}px 0 0 ${num(pad)}px;vertical-align:top;white-space:nowrap;overflow:hidden;${border}${side}${background}`;
        return `<td style="${style}">${mine.map((t) => lineHtml(t, baseFont)).join("")}</td>`;
      });
      table.push(`<tr style="height:${num(height)}px">${cells.join("")}</tr>`);
      continue;
    }
    flush();
    const sorted = [...inBand].sort((a, b) => a.label.box.y - b.label.box.y);
    const padTop = sorted.length ? sorted[0].label.box.y - band.top : 0;
    const lines = sorted.map((t) => {
      const centred = !t.listed && Math.abs(center(t.label.box).x - center(box).x) < 1.5;
      const align = centred ? "text-align:center" : `text-align:left;padding-left:${num(t.label.box.x - box.x - inset)}px`;
      return `<div style="${align};height:${num(t.label.box.height)}px;line-height:${num(t.label.box.height)}px;white-space:nowrap">${lineHtml(t, baseFont)}</div>`;
    });
    parts.push(`<div style="box-sizing:border-box;height:${num(height)}px;padding-top:${num(padTop)}px;overflow:hidden;${border}${background}">${lines.join("")}</div>`);
  }
  flush();

  const font = base.filter(([k]) => k !== "fontStyle");
  const html = inset ? `<div style="padding:0 ${num(inset)}px">${parts.join("")}</div>` : parts.join("");
  return {
    label: { html, box, style: font, lines: 1, lineHeight: 1.2 },
    style: [["html", 1], ["whiteSpace", "wrap"], ["overflow", "fill"], ["verticalAlign", "top"], ["align", "left"], ["spacing", 0], ...font],
  };
}

/** The part of a row or divider that draws its line. */
function stroked(g: SVGGElement): SVGGraphicsElement | undefined {
  return Array.from(g.querySelectorAll<SVGGraphicsElement>("path, line, rect")).find((p) => {
    const cs = getComputedStyle(p);
    return drawioColor(resolvePaint(cs.stroke, p)).color !== "none" && px(cs.strokeWidth, 1) > 0;
  });
}

function paint(el: SVGGraphicsElement): { colour: string; width: number } {
  const cs = getComputedStyle(el);
  return { colour: drawioColor(resolvePaint(cs.stroke, el)).color, width: px(cs.strokeWidth, 1) };
}

const lineCss = (l: { colour: string; width: number }) => `${num(l.width)}px solid ${l.colour}`;

/** One text of a row, with what differs from the cell's font (bold title, italic or underlined members, colour). */
function lineHtml(t: Text, base: Map<string, string | number | null>): string {
  const style = new Map(t.label.style);
  const bits = Number(style.get("fontStyle") ?? 0);
  let html = t.label.html;
  const css: string[] = [];
  if (style.get("fontColor") !== base.get("fontColor")) css.push(`color:${style.get("fontColor")}`);
  if (style.get("fontSize") !== base.get("fontSize")) css.push(`font-size:${num(Number(style.get("fontSize")))}px`);
  if (css.length) html = `<span style="${css.join(";")}">${html}</span>`;
  if (bits & 1) html = `<b>${html}</b>`;
  if (bits & 2) html = `<i>${html}</i>`;
  if (bits & 4 || t.underline) html = `<u>${html}</u>`;
  return html;
}
