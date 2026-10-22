#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync, inflateSync } from "node:zlib";

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const HELP = `Mermaid -> editable Draw.io -> PNG
node diagram.mjs --input workflow.mmd --out outputs/workflow [options]
node diagram.mjs --render-only outputs/workflow.drawio --png outputs/workflow.png
  --mode MODE           faithful (default) or beautify
  --config FILE         Mermaid initialization config (JSON)
  --title TEXT          Optional title above the diagram (beautify only)
  --subtitle TEXT       Optional subtitle (requires --title)
  --style-map FILE      JSON object: Mermaid node ID -> palette name
  --preserve-colors     Retain colors from the Mermaid source
  --node-spacing N      Node spacing (default 55)
  --rank-spacing N      Rank spacing (default 80)
  --font-size N         Font size in pixels (default 17)
  --font-family TEXT    Font stack (default Arial, Helvetica, sans-serif)
  --scale N             PNG export scale (default 1.5)
  --repo PATH           Converter checkout (default: containing checkout)
  --drawio PATH         Draw.io desktop executable
  --browser PATH        Chromium executable (default Playwright's bundled one)
  --work-dir PATH       Intermediates (default work/mermaid-drawio/<basename>)
  --overwrite           Replace existing output files
  --print-repo          Print resolved checkout and exit (no dependencies needed)
  --help                Show this help
Styling, spacing and font options require --mode beautify.
Faithful mode uses Mermaid defaults/source configuration, with no visual overrides.
Palettes: blue, purple, teal, green, amber, neutral, dark.
`;
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
function prettyXml(xml) {
  let depth = 0;
  return (
    xml
      .replace(/>\s*</g, ">\n<")
      .split("\n")
      .map((line) => {
        line = line.trim();
        if (line.startsWith("</")) depth--;
        const out = "  ".repeat(Math.max(0, depth)) + line;
        if (
          /^<[^!?/]/.test(line) &&
          !line.endsWith("/>") &&
          !line.includes("</")
        )
          depth++;
        return out;
      })
      .join("\n") + "\n"
  );
}
function argsOf(argv) {
  const flags = new Set(["help", "overwrite", "preserve-colors", "print-repo"]);
  const values = new Set([
    "input",
    "out",
    "mode",
    "config",
    "title",
    "subtitle",
    "style-map",
    "node-spacing",
    "rank-spacing",
    "font-size",
    "font-family",
    "scale",
    "repo",
    "drawio",
    "browser",
    "work-dir",
    "render-only",
    "png",
  ]);
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (!argv[i].startsWith("--") || (!flags.has(k) && !values.has(k)))
      throw new Error(`Unknown option: ${argv[i]}`);
    if (flags.has(k)) a[k] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith("--"))
        throw new Error(`Missing value for --${k}`);
      a[k] = argv[++i];
    }
  }
  if (a.help) return a;
  a.mode ??= "faithful";
  if (!["faithful", "beautify"].includes(a.mode))
    throw new Error("--mode must be faithful or beautify");
  const styling = [
    "title",
    "subtitle",
    "style-map",
    "preserve-colors",
    "node-spacing",
    "rank-spacing",
    "font-size",
    "font-family",
  ];
  if (a.mode === "faithful" && styling.some((k) => k in a))
    throw new Error(
      "Styling options require --mode beautify. Use --config for faithful Mermaid rendering configuration.",
    );
  for (const [k, d] of [
    ["node-spacing", 55],
    ["rank-spacing", 80],
    ["font-size", 17],
    ["scale", 1.5],
  ]) {
    a[k] = a[k] === undefined ? d : Number(a[k]);
    if (!Number.isFinite(a[k]) || a[k] <= 0)
      throw new Error(`--${k} must be positive`);
  }
  return a;
}
async function writable(files, overwrite) {
  for (const file of files) {
    if (!overwrite && (await exists(file)))
      throw new Error(`Output exists: ${file}. Use --overwrite.`);
    await fs.mkdir(path.dirname(file), { recursive: true });
  }
}

// Resolve from the helper's location, never from the caller's working directory.
// Source archives and development checkouts need no Git metadata or fixed HEAD.
async function isRepo(dir) {
  try {
    const pkg = JSON.parse(
      await fs.readFile(path.join(dir, "package.json"), "utf8"),
    );
    return (
      pkg.name === "mermaid-drawio" &&
      (await exists(path.join(dir, "src", "index.ts")))
    );
  } catch {
    return false;
  }
}

export async function resolveRepo(
  a = {},
  local = {},
  skillDir = SKILL_DIR,
  env = process.env,
) {
  const explicit = a.repo || env.MERMAID_DRAWIO_REPO;
  const configured = explicit
    ? path.resolve(explicit)
    : local.repo
      ? path.resolve(skillDir, local.repo)
      : undefined;
  if (configured) {
    if (!(await isRepo(configured)))
      throw new Error(
        `Converter checkout not found: ${configured}. Supply --repo PATH.`,
      );
    return configured;
  }
  let dir = path.resolve(skillDir);
  for (;;) {
    if (await isRepo(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "No containing mermaid-drawio checkout. Supply --repo PATH or MERMAID_DRAWIO_REPO; see SETUP.md.",
  );
}
async function findExecutable(value) {
  if (!value) return undefined;
  if (await exists(value)) return path.resolve(value);
  if (path.basename(value) !== value) return undefined;
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    for (const suffix of process.platform === "win32" ? ["", ".exe"] : [""]) {
      const candidate = path.join(dir.replace(/^"|"$/g, ""), value + suffix);
      if (await exists(candidate)) return path.resolve(candidate);
    }
  }
}
async function drawioPath(a, local = {}) {
  const explicit = a.drawio || process.env.DRAWIO_EXE || local.drawio;
  if (explicit) {
    const found = await findExecutable(explicit);
    if (!found)
      throw new Error(`Configured Draw.io executable not found: ${explicit}`);
    return found;
  }
  const candidates = [
    "drawio",
    "draw.io",
    path.join(
      process.env.ProgramFiles || path.join("C:", "Program Files"),
      "draw.io",
      "draw.io.exe",
    ),
    path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Programs",
      "draw.io",
      "draw.io.exe",
    ),
    "/Applications/draw.io.app/Contents/MacOS/draw.io",
    path.join(
      os.homedir(),
      "Applications",
      "draw.io.app",
      "Contents",
      "MacOS",
      "draw.io",
    ),
    "/usr/bin/drawio",
    "/opt/drawio/drawio",
  ];
  for (const p of candidates) {
    const found = await findExecutable(p);
    if (found) return found;
  }
  throw new Error(
    "Draw.io desktop not found. Supply --drawio PATH or DRAWIO_EXE.",
  );
}
function run(exe, args, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Export timed out after ${timeout / 1000}s`));
    }, timeout);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code !== 0
        ? reject(
            new Error(
              `Export failed (${code}): ${(stderr || stdout).slice(-3000)}`,
            ),
          )
        : resolve();
    });
  });
}
const EXPORT_BOUNDS_PADDING = 32;

function directChild(element, name) {
  return [...element.children].find((child) => child.tagName === name);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function addExportBoundsToModel(model, extentScale = 1) {
  const root = directChild(model, "root");
  if (!root) throw new Error("Draw.io page has no mxGraphModel/root element.");
  for (const old of root.querySelectorAll(
    'mxCell[data-mermaid-drawio-export-bound="1"]',
  ))
    old.remove();
  const cells = [...root.querySelectorAll("mxCell")];
  const byId = new Map(cells.map((cell) => [cell.getAttribute("id"), cell]));
  const origins = new Map();
  const resolving = new Set();
  const geometry = (cell) => directChild(cell, "mxGeometry");
  const origin = (cell) => {
    if (!cell) return { x: 0, y: 0 };
    if (origins.has(cell)) return origins.get(cell);
    if (resolving.has(cell))
      throw new Error(`Cycle in Draw.io parent hierarchy at ${cell.id}.`);
    resolving.add(cell);
    const parent = byId.get(cell.getAttribute("parent"));
    const base =
      parent?.getAttribute("vertex") === "1"
        ? origin(parent)
        : { x: 0, y: 0 };
    const g = geometry(cell);
    let x = base.x,
      y = base.y;
    if (g && cell.getAttribute("vertex") === "1") {
      if (g.getAttribute("relative") === "1" && parent) {
        const pg = geometry(parent);
        x += finite(g.getAttribute("x")) * finite(pg?.getAttribute("width"));
        y += finite(g.getAttribute("y")) * finite(pg?.getAttribute("height"));
        const offset = [...g.children].find(
          (child) =>
            child.tagName === "mxPoint" && child.getAttribute("as") === "offset",
        );
        x += finite(offset?.getAttribute("x"));
        y += finite(offset?.getAttribute("y"));
      } else {
        x += finite(g.getAttribute("x"));
        y += finite(g.getAttribute("y"));
      }
    }
    const result = { x, y };
    resolving.delete(cell);
    origins.set(cell, result);
    return result;
  };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const include = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const cell of cells) {
    const g = geometry(cell);
    if (!g) continue;
    const base = origin(cell);
    if (cell.getAttribute("vertex") === "1") {
      include(base.x, base.y);
      include(
        base.x + finite(g.getAttribute("width")),
        base.y + finite(g.getAttribute("height")),
      );
    } else if (cell.getAttribute("edge") === "1") {
      const parent = byId.get(cell.getAttribute("parent"));
      const edgeBase =
        parent?.getAttribute("vertex") === "1" ? origin(parent) : { x: 0, y: 0 };
      for (const point of g.querySelectorAll(
        'Array[as="points"] > mxPoint, mxPoint[as="sourcePoint"], mxPoint[as="targetPoint"]',
      ))
        include(
          edgeBase.x + finite(point.getAttribute("x")),
          edgeBase.y + finite(point.getAttribute("y")),
        );
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return undefined;
  const layer =
    [...root.children].find(
      (cell) => cell.tagName === "mxCell" && cell.getAttribute("parent") === "0",
    )?.getAttribute("id") || "1";
  const addMarker = (suffix, x, y) => {
    const cell = model.ownerDocument.createElement("mxCell");
    cell.setAttribute("id", `__mermaid_drawio_export_bound_${suffix}__`);
    cell.setAttribute("value", "");
    cell.setAttribute("vertex", "1");
    cell.setAttribute("parent", layer);
    cell.setAttribute("data-mermaid-drawio-export-bound", "1");
    cell.setAttribute(
      "style",
      "shape=rect;fillColor=none;strokeColor=none;opacity=0;",
    );
    const g = model.ownerDocument.createElement("mxGeometry");
    g.setAttribute("x", String(x));
    g.setAttribute("y", String(y));
    g.setAttribute("width", "1");
    g.setAttribute("height", "1");
    g.setAttribute("as", "geometry");
    cell.appendChild(g);
    root.appendChild(cell);
  };
  const bounds = {
    minX: Math.floor(minX * extentScale - EXPORT_BOUNDS_PADDING),
    minY: Math.floor(minY * extentScale - EXPORT_BOUNDS_PADDING),
    maxX: Math.ceil(maxX * extentScale + EXPORT_BOUNDS_PADDING),
    maxY: Math.ceil(maxY * extentScale + EXPORT_BOUNDS_PADDING),
  };
  addMarker("min", bounds.minX, bounds.minY);
  addMarker("max", bounds.maxX, bounds.maxY);
  return bounds;
}

export function addExportBoundsToDrawio(xml, JSDOM, extentScale = 1) {
  const outer = new JSDOM(xml, { contentType: "application/xml" });
  const diagrams = [
    ...outer.window.document.querySelectorAll("mxfile > diagram"),
  ];
  if (!diagrams.length) throw new Error("Draw.io file has no diagram pages.");
  for (const diagram of diagrams) {
    let model = directChild(diagram, "mxGraphModel");
    if (model) {
      addExportBoundsToModel(model, extentScale);
      continue;
    }
    const payload = diagram.textContent.trim();
    if (!payload) throw new Error("Draw.io diagram page is empty.");
    let pageXml;
    try {
      pageXml = decodeURIComponent(
        inflateRawSync(Buffer.from(payload, "base64")).toString("utf8"),
      );
    } catch (error) {
      throw new Error(`Cannot decode compressed Draw.io page: ${error.message}`);
    }
    const page = new JSDOM(pageXml, { contentType: "application/xml" });
    model = page.window.document.documentElement;
    if (model.tagName !== "mxGraphModel")
      throw new Error("Decoded Draw.io page has no mxGraphModel root.");
    addExportBoundsToModel(model, extentScale);
    const encoded = encodeURIComponent(
      page.window.document.documentElement.outerHTML,
    );
    diagram.textContent = deflateRawSync(Buffer.from(encoded)).toString("base64");
  }
  return outer.serialize();
}

function pngTouchesEdge(buffer, margin) {
  const width = buffer.readUInt32BE(16),
    height = buffer.readUInt32BE(20),
    bitDepth = buffer[24],
    colorType = buffer[25],
    interlace = buffer[28];
  const bytesPerPixel = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (bitDepth !== 8 || !bytesPerPixel || interlace !== 0)
    throw new Error(
      `Unsupported Draw.io PNG format: depth ${bitDepth}, color type ${colorType}, interlace ${interlace}.`,
    );
  const chunks = [];
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT")
      chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }
  const packed = inflateSync(Buffer.concat(chunks));
  const stride = width * bytesPerPixel;
  if (packed.length !== (stride + 1) * height)
    throw new Error("Unexpected Draw.io PNG scanline size.");
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const raw = packed[y * (stride + 1) + x + 1];
      const left =
        x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft =
        y && x >= bytesPerPixel
          ? pixels[(y - 1) * stride + x - bytesPerPixel]
          : 0;
      const value =
        filter === 0
          ? raw
          : filter === 1
            ? raw + left
            : filter === 2
              ? raw + up
              : filter === 3
                ? raw + Math.floor((left + up) / 2)
                : filter === 4
                  ? raw + paeth(left, up, upperLeft)
                  : NaN;
      if (!Number.isFinite(value))
        throw new Error(`Unknown PNG filter ${filter}.`);
      pixels[y * stride + x] = value & 255;
    }
  }
  const background = pixels.subarray(0, bytesPerPixel);
  const differs = (x, y) => {
    const offset = y * stride + x * bytesPerPixel;
    for (let channel = 0; channel < bytesPerPixel; channel++)
      if (pixels[offset + channel] !== background[channel]) return true;
    return false;
  };
  const inset = Math.min(margin, Math.floor(width / 2), Math.floor(height / 2));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < inset; x++)
      if (differs(x, y) || differs(width - 1 - x, y)) return true;
  for (let y = 0; y < inset; y++)
    for (let x = inset; x < width - inset; x++)
      if (differs(x, y) || differs(x, height - 1 - y)) return true;
  return false;
}

async function render(a, input, png, exe, repo) {
  const stage = path.join(
    path.dirname(png),
    `.${path.basename(png)}.${process.pid}.${Date.now()}.png`,
  );
  const exportCopy = stage + ".drawio";
  try {
    const req = createRequire(path.join(repo, "package.json"));
    const { JSDOM } = req("jsdom");
    const source = await fs.readFile(input, "utf8");
    let extentScale = 1;
    for (let attempt = 0; attempt < 5; attempt++) {
      await fs.writeFile(
        exportCopy,
        addExportBoundsToDrawio(source, JSDOM, extentScale),
        "utf8",
      );
      await run(exe, [
        "--force-device-scale-factor=1",
        "--export",
        "--format",
        "png",
        "--scale",
        String(a.scale),
        "--border",
        "24",
        "--output",
        stage,
        exportCopy,
      ]);
      const buf = await fs.readFile(stage);
      if (
        buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        buf.length < 100
      )
        throw new Error("Export produced invalid PNG.");
      const size = {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
      };
      if (!size.width || !size.height) throw new Error("Empty PNG dimensions.");
      if (!pngTouchesEdge(buf, Math.max(2, Math.ceil(a.scale * 4)))) {
        await fs.copyFile(stage, png);
        return size;
      }
      extentScale *= 1.25;
    }
    throw new Error(
      "Draw.io export remained clipped after five bounds attempts.",
    );
  } finally {
    await fs.rm(stage, { force: true });
    await fs.rm(exportCopy, { force: true });
  }
}

export async function convertInBrowser({
  code,
  config = {},
  mode = "faithful",
  roles = {},
  title,
  subtitle,
  preserve = false,
  nodeSpacing = 55,
  rankSpacing = 80,
  fontSize = 17,
  fontFamily = "Arial, Helvetica, sans-serif",
}) {
  const visual =
    mode === "beautify"
      ? {
          theme: "base",
          fontFamily,
          fontSize,
          themeVariables: {
            fontFamily,
            fontSize: fontSize + "px",
            primaryColor: "#EAF2FF",
            primaryTextColor: "#234F87",
            primaryBorderColor: "#9FBDE8",
            lineColor: "#58718F",
            clusterBkg: "#F7F9FC",
            clusterBorder: "#DCE3ED",
            edgeLabelBackground: "#FFFFFF",
          },
          flowchart: {
            htmlLabels: true,
            curve: "linear",
            nodeSpacing,
            rankSpacing,
            padding: 22,
            wrappingWidth: 220,
          },
        }
      : {};
  // Merge nested sections so a supplied config keeps the other beautify defaults.
  const merged = { ...visual, ...config };
  for (const k of ["themeVariables", "flowchart"])
    if (visual[k] && config[k]) merged[k] = { ...visual[k], ...config[k] };
  // Mermaid's default `secure` list already protects these keys (and more)
  // from source directives; don't replace it.
  mermaid.initialize({
    ...merged,
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    maxTextSize: 100000,
  });
  await document.fonts.ready;
  const { svg } = await mermaid.render("diagram", code);
  // The converter takes state, ER and class diagrams too; beautify styles flowcharts only.
  const type = /aria-roledescription="([^"]*)"/.exec(svg)?.[1] ?? "";
  if (mode === "beautify" && !/^flowchart/.test(type))
    throw new Error(
      `Beautify mode supports flowcharts only; convert this ${type} diagram in faithful mode.`,
    );
  const raw = MermaidDrawio.svgStringToDrawio(
    svg,
    mode === "beautify"
      ? { pageName: title || "Flowchart", background: "#FFFFFF" }
      : {},
  );
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror"))
    throw new Error("Converter produced invalid XML.");
  const root = doc.querySelector("root"),
    model = doc.querySelector("mxGraphModel"),
    cells = [...root.querySelectorAll("mxCell")];
  const styles = (c) =>
    Object.fromEntries(
      (c.getAttribute("style") || "")
        .split(";")
        .filter(Boolean)
        .map((p) => {
          const i = p.indexOf("=");
          return i < 0 ? [p, null] : [p.slice(0, i), p.slice(i + 1)];
        }),
    );
  const put = (c, s) =>
    c.setAttribute(
      "style",
      Object.entries(s)
        .map(([k, v]) => (v === null ? k : `${k}=${v}`))
        .join(";") + ";",
    );
  const signature = () =>
    cells.map((c) => {
      const s = styles(c),
        retained = {};
      for (const [k, v] of Object.entries(s)) if (v === null) retained[k] = v;
      for (const k of [
        "shape",
        "perimeter",
        "points",
        "polyCoords",
        "polyline",
        "size",
        "fixedSize",
        "flipH",
        "flipV",
        "boundedLbl",
        "backgroundOutline",
        "container",
        "startArrow",
        "endArrow",
        "startFill",
        "endFill",
        "dashed",
        "dashPattern",
        "direction",
        "double",
        "startSize",
        "endSize",
      ])
        if (k in s) retained[k] = s[k];
      return [
        c.id,
        c.getAttribute("value"),
        c.getAttribute("parent"),
        c.getAttribute("source"),
        c.getAttribute("target"),
        c.getAttribute("vertex"),
        c.getAttribute("edge"),
        retained,
      ];
    });
  const before = JSON.stringify(signature());
  if (mode === "faithful")
    return {
      svg,
      raw,
      xml: raw,
      counts: {
        nodes: cells.filter(
          (c) =>
            c.getAttribute("vertex") === "1" && styles(c).container !== "1",
        ).length,
        groups: cells.filter((c) => styles(c).container === "1").length,
        edges: cells.filter((c) => c.getAttribute("edge") === "1").length,
      },
      semanticsVerified: true,
    };
  const palette = {
    blue: ["#EAF2FF", "#9FBDE8", "#234F87"],
    purple: ["#F0EBFF", "#B8A4E8", "#5B3992"],
    teal: ["#E8F5F4", "#94CCC6", "#226660"],
    green: ["#ECF6EE", "#A7CEAE", "#306841"],
    amber: ["#FFF5DF", "#DEC081", "#855E14"],
    neutral: ["#FFFFFF", "#CBD5E1", "#334155"],
    // Keep internal strokes visible on subroutine and double-outline shapes.
    dark: ["#254B78", "#9FBDE8", "#FFFFFF"],
  };
  const unused = new Set(Object.keys(roles));
  let nodeCount = 0,
    edgeCount = 0,
    groupCount = 0;
  for (const c of cells) {
    const s = styles(c);
    if (c.getAttribute("vertex") === "1") {
      const group = s.container === "1";
      group ? groupCount++ : nodeCount++;
      const role = roles[c.id] || roles[c.id.replace(/^node-/, "")];
      if (role) {
        unused.delete(c.id);
        unused.delete(c.id.replace(/^node-/, ""));
      }
      if (!preserve) {
        const kind =
          role ||
          (group
            ? "neutral"
            : "rhombus" in s || s.shape === "rhombus"
              ? "amber"
              : s.shape?.startsWith("cylinder")
                ? "teal"
                : "blue");
        const [fill, stroke, font] = palette[kind];
        Object.assign(s, {
          fillColor: group ? "#F7F9FC" : fill,
          strokeColor: stroke,
          fontColor: font,
          shadow: "0",
        });
        if (kind === "dark")
          s.fontStyle = String((Number(s.fontStyle) || 0) | 1);
      }
      s.strokeWidth = String(
        Math.max(Number(s.strokeWidth) || 1, group ? 1 : 1.5),
      );
      if (!s.shape && s.rounded === "0" && !group) {
        s.rounded = "1";
        s.arcSize = "12";
      }
      if (group) {
        Object.assign(s, {
          rounded: "1",
          arcSize: "8",
          fontStyle: "1",
          fontSize: "13",
          align: "left",
          spacingLeft: "20",
          spacingRight: "20",
          spacingTop: "12",
        });
      }
      put(c, s);
    } else if (c.getAttribute("edge") === "1") {
      edgeCount++;
      if (s.strokeColor !== "none") {
        if (!preserve) s.strokeColor = "#58718F";
        s.strokeWidth = String(Math.max(Number(s.strokeWidth) || 1, 1.7));
      }
      if (s.curved !== "1") {
        s.rounded = "1";
        s.arcSize = "12";
      }
      put(c, s);
    }
  }
  if (unused.size)
    throw new Error("Style map IDs not found: " + [...unused].join(", "));
  if (before !== JSON.stringify(signature()))
    throw new Error("Styling changed diagram semantics.");
  // Shift root-level geometry together. Nested children follow containers;
  // relative edge label coordinates and offsets must not be translated.
  let maxRight = 0,
    maxBottom = 0;
  const dx = 32,
    dy = title ? (subtitle ? 124 : 96) : 32;
  for (const c of cells) {
    const g = c.querySelector(":scope > mxGeometry");
    if (!g || c.getAttribute("parent") !== "1") continue;
    if (c.getAttribute("vertex") === "1") {
      g.setAttribute("x", String(Number(g.getAttribute("x") || 0) + dx));
      g.setAttribute("y", String(Number(g.getAttribute("y") || 0) + dy));
      maxRight = Math.max(
        maxRight,
        Number(g.getAttribute("x")) + Number(g.getAttribute("width")),
      );
      maxBottom = Math.max(
        maxBottom,
        Number(g.getAttribute("y")) + Number(g.getAttribute("height")),
      );
    } else if (c.getAttribute("edge") === "1")
      for (const p of g.querySelectorAll(
        'Array[as="points"] > mxPoint, mxPoint[as="sourcePoint"], mxPoint[as="targetPoint"]',
      )) {
        p.setAttribute("x", String(Number(p.getAttribute("x") || 0) + dx));
        p.setAttribute("y", String(Number(p.getAttribute("y") || 0) + dy));
      }
  }
  function addText(id, value, y, height, size, color) {
    const c = doc.createElement("mxCell");
    for (const [k, v] of Object.entries({
      id,
      value,
      vertex: "1",
      parent: "1",
      style: `text;html=0;strokeColor=none;fillColor=none;whiteSpace=wrap;align=left;verticalAlign=middle;fontFamily=${fontFamily.replaceAll(";", ",")};fontSize=${size};fontColor=${color};fontStyle=${size > 20 ? 1 : 0};`,
    }))
      c.setAttribute(k, v);
    const g = doc.createElement("mxGeometry");
    for (const [k, v] of Object.entries({
      x: 32,
      y,
      width: Math.max(maxRight - 32, 600),
      height,
      as: "geometry",
    }))
      g.setAttribute(k, String(v));
    c.appendChild(g);
    root.appendChild(c);
  }
  if (title) addText("beautify-title", title, 20, 55, 28, "#14263D");
  if (subtitle) addText("beautify-subtitle", subtitle, 77, 30, 15, "#64748B");
  model.setAttribute("background", "#FFFFFF");
  model.setAttribute("page", "0");
  model.setAttribute("pageWidth", String(Math.ceil(maxRight + 32)));
  model.setAttribute("pageHeight", String(Math.ceil(maxBottom + 32)));
  return {
    svg,
    raw,
    xml: new XMLSerializer().serializeToString(doc),
    counts: { nodes: nodeCount, edges: edgeCount, groups: groupCount },
    semanticsVerified: true,
  };
}

async function main() {
  const a = argsOf(process.argv.slice(2));
  if (a.help) {
    console.log(HELP);
    return;
  }
  const configPath = path.join(SKILL_DIR, "config.local.json");
  const local = (await exists(configPath))
    ? JSON.parse(await fs.readFile(configPath, "utf8"))
    : {};
  if (a["print-repo"]) {
    console.log(await resolveRepo(a, local));
    return;
  }
  if (a["render-only"]) {
    if (!a.png) throw new Error("--render-only requires --png");
    const input = path.resolve(a["render-only"]),
      png = path.resolve(a.png);
    if (input === png)
      throw new Error("PNG output must differ from input XML.");
    if (!(await exists(input))) throw new Error(`Missing diagram: ${input}`);
    await writable([png], a.overwrite);
    const repo = await resolveRepo(a, local);
    console.log(
      JSON.stringify(
        {
          drawio: input,
          png,
          ...(await render(
            a,
            input,
            png,
            await drawioPath(a, local),
            repo,
          )),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!a.input || !a.out)
    throw new Error("--input and --out are required. Use --help.");
  if (a.subtitle && !a.title) throw new Error("--subtitle requires --title");
  const input = path.resolve(a.input),
    stem = path.resolve(a.out);
  const output = {
    drawio: stem + ".drawio",
    png: stem + ".png",
    mermaid: stem + ".mmd",
  };
  if (Object.values(output).includes(input))
    throw new Error(
      "Input must differ from output paths; put source in work/.",
    );
  await writable(Object.values(output), a.overwrite);
  const repo = await resolveRepo(a, local);
  const req = createRequire(path.join(repo, "package.json"));
  let chromium, build, mermaidJs;
  try {
    ({ chromium } = req("playwright"));
    ({ build } = req("esbuild"));
    mermaidJs = req.resolve("mermaid/dist/mermaid.min.js");
  } catch (e) {
    throw new Error(
      `Missing dependencies. Run npm ci in ${repo}. ${e.message}`,
    );
  }
  const exe = await drawioPath(a, local),
    work = path.resolve(
      a["work-dir"] || path.join("work", "mermaid-drawio", path.basename(stem)),
    );
  await fs.mkdir(work, { recursive: true });
  const code = await fs.readFile(input, "utf8");
  const config = a.config
    ? JSON.parse(await fs.readFile(path.resolve(a.config), "utf8"))
    : {};
  if (!config || Array.isArray(config) || typeof config !== "object")
    throw new Error("Mermaid config must be a JSON object.");
  const roles = a["style-map"]
    ? JSON.parse(await fs.readFile(path.resolve(a["style-map"]), "utf8"))
    : {};
  const names = ["blue", "purple", "teal", "green", "amber", "neutral", "dark"];
  if (!roles || Array.isArray(roles) || typeof roles !== "object")
    throw new Error("Style map must be a JSON object.");
  for (const [id, role] of Object.entries(roles))
    if (!names.includes(role))
      throw new Error(`Unknown palette ${role} for ${id}.`);
  const bundle = await build({
    entryPoints: [path.join(repo, "src", "index.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "MermaidDrawio",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });
  let browser, result;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath:
        a.browser ||
        process.env.MERMAID_DRAWIO_BROWSER ||
        local.browser ||
        undefined,
    });
    const page = await browser.newPage({
      viewport: { width: 1800, height: 1200 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(45000);
    await page.route("**/*", (r) => r.abort());
    await page.setContent(
      '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    );
    await page.addScriptTag({ path: mermaidJs });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    result = await page.evaluate(convertInBrowser, {
      code,
      config,
      mode: a.mode,
      roles,
      title: a.title,
      subtitle: a.subtitle,
      preserve: !!a["preserve-colors"],
      nodeSpacing: a["node-spacing"],
      rankSpacing: a["rank-spacing"],
      fontSize: a["font-size"],
      fontFamily: a["font-family"] || "Arial, Helvetica, sans-serif",
    });
  } finally {
    if (browser) await browser.close();
  }
  await fs.writeFile(path.join(work, "source.svg"), result.svg, "utf8");
  await fs.writeFile(path.join(work, "raw.drawio"), result.raw, "utf8");
  await fs.writeFile(
    output.drawio,
    a.mode === "faithful" ? result.raw : prettyXml(result.xml),
    "utf8",
  );
  await fs.writeFile(output.mermaid, code, "utf8");
  const size = await render(a, output.drawio, output.png, exe, repo);
  const report = {
    ...output,
    ...size,
    ...result.counts,
    mode: a.mode,
    semanticsVerified: result.semanticsVerified,
    repo,
    work,
  };
  await fs.writeFile(
    path.join(work, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
if (
  process.argv[1] &&
  (await fs.realpath(process.argv[1])) === fileURLToPath(import.meta.url)
) {
  main().catch((e) => {
    console.error("Error: " + e.message);
    process.exitCode = 1;
  });
}
