/** Reading computed CSS and writing draw.io style strings. */

/** A draw.io style: `key=value` pairs (a value of `null` writes a bare key, like `ellipse`). */
export type Style = Array<[string, string | number | null]>;

export function styleString(style: Style): string {
  return style.map(([k, v]) => (v === null ? k : `${k}=${typeof v === "number" ? num(v) : v}`)).join(";") + ";";
}

/** Numbers as draw.io files usually have them: at most two decimals. */
export function num(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse a computed colour (`rgb(…)`, `rgba(…)`, `#rrggbb`); undefined for `none`/transparent/unknown. */
export function parseColor(value: string | null | undefined): Rgba | undefined {
  if (!value) return undefined;
  const v = value.trim();
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (a === 0) return undefined;
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
  }
  return undefined;
}

export const hex = ({ r, g, b }: Rgba) =>
  "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("").toUpperCase();

/** A colour and its opacity (0–100) as draw.io wants them; `none` when there's no colour. */
export function drawioColor(value: string | null | undefined): { color: string; opacity?: number } {
  const c = parseColor(value);
  if (!c) return { color: "none" };
  return c.a < 1 ? { color: hex(c), opacity: Math.round(c.a * 100) } : { color: hex(c) };
}

/** Lay `top` over `bottom` (both may be translucent). */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

export const px = (value: string | null | undefined, fallback = 0) => {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : fallback;
};

/** A CSS dash array (`5px, 5px`, `5 5`) as a draw.io dashPattern, or undefined for solid. */
export function dashPattern(value: string | null | undefined): string | undefined {
  if (!value || value === "none") return undefined;
  const parts = value.split(/[\s,]+/).map((s) => parseFloat(s)).filter((n) => Number.isFinite(n));
  if (parts.length === 0 || parts.every((n) => n === 0)) return undefined;
  // An odd-length dash array repeats (SVG rule).
  const pattern = parts.length % 2 ? [...parts, ...parts] : parts;
  return pattern.map(num).join(" ");
}

/** A font-family list without quotes (draw.io writes it straight into CSS). */
export const fontFamily = (value: string) =>
  value
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .join(",");

/** draw.io's fontStyle bit field: 1 bold, 2 italic, 4 underline. */
export function fontStyleBits(cs: CSSStyleDeclaration): number {
  const weight = cs.fontWeight === "bold" ? 700 : parseInt(cs.fontWeight, 10) || 400;
  return (weight >= 600 ? 1 : 0) | (cs.fontStyle === "italic" || cs.fontStyle === "oblique" ? 2 : 0) |
    (cs.textDecorationLine?.includes("underline") ? 4 : 0);
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
