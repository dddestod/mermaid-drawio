/** Labels: Mermaid's HTML labels (foreignObject) or SVG text, as draw.io HTML values. */
import { boxInRoot, type Box } from "./geometry.ts";
import { escapeHtml, fontFamily, fontStyleBits, hex, over, parseColor, px, type Style } from "./style.ts";

export interface Label {
  /** draw.io HTML for the cell's value. */
  html: string;
  box: Box;
  style: Style;
  /** The label's background, for edge labels (opaque, as draw.io wants it). */
  background?: string;
  /** Lines in the label. */
  lines: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
}

/** Inline elements a label may keep; anything else is unwrapped to its text. */
const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "S", "DEL", "CODE", "SUB", "SUP", "BR", "SPAN", "A", "SMALL", "MARK"]);

/** The label inside `container` (a node, cluster or edge label group), if it has text. */
export function readLabel(container: Element, root: SVGSVGElement): Label | undefined {
  const fo = container.querySelector("foreignObject");
  if (fo) return htmlLabel(fo, root);
  const text = container.querySelector("text");
  if (text) return textLabel(text, root);
  return undefined;
}

function htmlLabel(fo: SVGForeignObjectElement, root: SVGSVGElement): Label | undefined {
  const content = fo.querySelector(".nodeLabel, .edgeLabel, .cluster-label") ?? fo.firstElementChild;
  if (!content) return undefined;
  const paragraphs = content.querySelectorAll(":scope > p");
  const parts = paragraphs.length ? Array.from(paragraphs, (p) => inlineHtml(p)) : [inlineHtml(content)];
  const html = parts.join("<br>").trim();
  if (!html.replace(/<br>/g, "").trim()) return undefined;
  const cs = getComputedStyle(content);
  const box = boxInRoot(fo, root);
  const lineHeight = px(cs.lineHeight, px(cs.fontSize, 16) * 1.5);
  return {
    html,
    box,
    style: fontStyle(cs),
    background: background(content, fo),
    lines: Math.max(1, Math.round(box.height / lineHeight)),
    lineHeight: lineHeight / px(cs.fontSize, 16),
  };
}

/** An element's children as label HTML: kept inline tags, everything else as its text. */
function inlineHtml(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += escapeHtml(node.textContent ?? "");
    else if (node instanceof Element) {
      const tag = node.tagName.toUpperCase();
      if (tag === "BR") out += "<br>";
      else if (tag === "P" || tag === "DIV") out += (out ? "<br>" : "") + inlineHtml(node);
      else if (KEEP.has(tag)) {
        const name = tag.toLowerCase();
        const href = name === "a" ? node.getAttribute("href") : null;
        const attr = href && /^(https?:|mailto:)/i.test(href) ? ` href="${escapeHtml(href).replace(/"/g, "&quot;")}"` : "";
        out += `<${name}${attr}>${inlineHtml(node)}</${name}>`;
      } else out += inlineHtml(node);
    }
  }
  return out;
}

/** An SVG `<text>` label. */
export function textLabel(text: SVGTextElement, root: SVGSVGElement): Label | undefined {
  // Mermaid writes one <tspan class="row"> per line (its own text wrapping).
  const rows = text.querySelectorAll("tspan.row");
  const lines = rows.length ? Array.from(rows, (r) => r.textContent ?? "") : [text.textContent ?? ""];
  const html = lines.map((l) => escapeHtml(l.trim())).join("<br>");
  if (!html.replace(/<br>/g, "").trim()) return undefined;
  const cs = getComputedStyle(text);
  const style = fontStyle(cs);
  const box = boxInRoot(text, root);
  // SVG text is coloured by fill, not color.
  const fill = parseColor(cs.fill);
  if (fill) style.splice(0, 1, ["fontColor", hex(fill)]);
  const label = text.closest(".label") ?? text;
  const bg = label.parentElement?.querySelector(":scope > rect.background, :scope > rect");
  return {
    html,
    box,
    style,
    background: bg ? opaque(getComputedStyle(bg).fill) : undefined,
    lines: lines.length,
    lineHeight: box.height / lines.length / px(cs.fontSize, 16),
  };
}

function fontStyle(cs: CSSStyleDeclaration): Style {
  const color = parseColor(cs.color);
  const style: Style = [
    ["fontColor", color ? hex(color) : "#000000"],
    ["fontFamily", fontFamily(cs.fontFamily)],
    ["fontSize", px(cs.fontSize, 16)],
  ];
  const bits = fontStyleBits(cs);
  if (bits) style.push(["fontStyle", bits]);
  return style;
}

/** The colour behind a label: its own and its wrappers' backgrounds, layered over white. */
function background(content: Element, stop: Element): string | undefined {
  const layers: string[] = [];
  for (let e: Element | null = content; e && e !== stop; e = e.parentElement) layers.push(getComputedStyle(e).backgroundColor);
  let colour: ReturnType<typeof parseColor>;
  for (const layer of layers.reverse()) {
    const c = parseColor(layer);
    if (c) colour = colour ? over(c, colour) : c;
  }
  return colour ? hex(over(colour, { r: 255, g: 255, b: 255, a: 1 })) : undefined;
}

function opaque(value: string): string | undefined {
  const c = parseColor(value);
  return c ? hex(over(c, { r: 255, g: 255, b: 255, a: 1 })) : undefined;
}
