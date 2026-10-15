import mermaid from "mermaid";
import { svgStringToDrawio } from "../src/index.ts";
import { MERMAID_CONFIG } from "../scripts/mermaid-config.mjs";

// draw.io's own viewer, to see the converted diagram as draw.io draws it.
const VIEWER = "https://viewer.diagrams.net/js/viewer-static.min.js";
declare const GraphViewer: { createViewerForElement(el: Element, done?: () => void): void };

const sources = import.meta.glob("../fixtures/*.mmd", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picker = $<HTMLSelectElement>("fixture");
const code = $<HTMLTextAreaElement>("code");
const dagre = $<HTMLInputElement>("dagre");
let xml = "";
let seq = 0;

mermaid.initialize(MERMAID_CONFIG);
for (const path of Object.keys(sources)) picker.add(new Option(path.replace(/^.*\/|\.mmd$/g, "")));
const params = new URLSearchParams(location.search);
picker.value = params.get("fixture") ?? picker.options[0].value;
code.value = sources[`../fixtures/${picker.value}.mmd`];

const viewer = new Promise<void>((resolve, reject) => {
  const s = document.createElement("script");
  s.src = VIEWER;
  s.onload = () => resolve();
  s.onerror = reject;
  document.head.appendChild(s);
});

async function update() {
  $("status").textContent = "";
  try {
    let src = code.value;
    if (dagre.checked && !/layout:/.test(src)) src = `---\nconfig:\n  layout: dagre\n---\n${src}`;
    const { svg } = await mermaid.render(`d${++seq}`, src);
    $("mermaid").innerHTML = svg;
    xml = svgStringToDrawio(svg, { pageName: picker.value });
    $("xml").textContent = xml;
    await viewer;
    const box = $("drawio");
    box.innerHTML = "";
    const div = document.createElement("div");
    div.className = "mxgraph";
    div.dataset.mxgraph = JSON.stringify({ xml, toolbar: "zoom", nav: false, resize: true, border: 8 });
    box.appendChild(div);
    GraphViewer.createViewerForElement(div, () => document.body.setAttribute("data-ready", String(seq)));
  } catch (err) {
    $("status").textContent = String(err);
    document.body.setAttribute("data-ready", "error");
  }
}

picker.onchange = () => {
  code.value = sources[`../fixtures/${picker.value}.mmd`];
  update();
};
dagre.onchange = update;
let timer = 0;
code.oninput = () => {
  clearTimeout(timer);
  timer = window.setTimeout(update, 400);
};
$("download").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([xml], { type: "application/xml" }));
  a.download = `${picker.value}.drawio`;
  a.click();
};
update();
