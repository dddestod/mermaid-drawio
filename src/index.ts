/**
 * Mermaid flowchart or state diagram (as Mermaid rendered it) → editable draw.io diagram.
 *
 * Reads the SVG Mermaid already drew, so positions, sizes, colours and labels
 * are what the user saw, not a fresh layout. Pinned to the SVG structure of
 * Mermaid 12.2 (see fixtures/).
 */
import { serialize } from "./drawio.ts";
import { flowchart } from "./flowchart.ts";
import { readDiagram, type Dialect } from "./renderer.ts";
import { state } from "./state.ts";
import { escapeXml } from "./style.ts";

export interface ToDrawioOptions {
  /** The draw.io page's name. Default "Page-1". */
  pageName?: string;
  /** Page background colour (e.g. for a dark theme's light text). Default none. */
  background?: string;
}

export class UnsupportedDiagramError extends Error {}

/** Convert a rendered Mermaid diagram to a draw.io file (`<mxfile>` XML, uncompressed). */
export function toDrawio(svg: SVGSVGElement, options: ToDrawioOptions = {}): string {
  const name = escapeXml(options.pageName ?? "Page-1");
  return `<mxfile host="mermaid-drawio">\n  <diagram id="mermaid" name="${name}">\n${indent(toMxGraphModel(svg, options), 4)}\n  </diagram>\n</mxfile>\n`;
}

/** Convert a rendered Mermaid diagram to draw.io's `<mxGraphModel>` XML. */
export function toMxGraphModel(svg: SVGSVGElement, options: ToDrawioOptions = {}): string {
  return withRendered(svg, () => serialize(readDiagram(svg, dialectFor(svg)), options));
}

/** Convert Mermaid's SVG markup (what `mermaid.render` returns) to a draw.io file. Needs a browser DOM. */
export function svgStringToDrawio(svgMarkup: string, options: ToDrawioOptions = {}): string {
  const host = document.createElement("div");
  host.innerHTML = svgMarkup;
  const svg = host.querySelector("svg");
  if (!svg) throw new UnsupportedDiagramError("No <svg> element in the markup.");
  return withRendered(svg, () => toDrawio(svg, options), host);
}

// ---------------------------------------------------------------------------

/**
 * Measuring (getBBox, getTotalLength, computed styles) needs the SVG in a
 * document and rendered. If it isn't, render it off-screen for the call.
 */
function withRendered<T>(svg: SVGSVGElement, fn: () => T, host: Element = svg): T {
  if (svg.isConnected && svg.getClientRects().length > 0) return fn();
  const parking = document.createElement("div");
  parking.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  const home = host.parentNode;
  const next = host.nextSibling;
  parking.appendChild(host);
  document.body.appendChild(parking);
  try {
    return fn();
  } finally {
    if (home) home.insertBefore(host, next);
    else host.remove();
    parking.remove();
  }
}

/** The diagram type, from what Mermaid tells screen readers it is. */
function dialectFor(svg: SVGSVGElement): Dialect {
  const type = svg.getAttribute("aria-roledescription") ?? "";
  if (/^flowchart/.test(type) || svg.classList.contains("flowchart")) return flowchart;
  if (type === "stateDiagram") return state;
  throw new UnsupportedDiagramError(`Only flowcharts and state diagrams are supported (this is "${type || "unknown"}").`);
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s.split("\n").map((l) => pad + l).join("\n");
}
