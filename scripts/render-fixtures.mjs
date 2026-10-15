// Render every fixtures/*.mmd with the pinned Mermaid in headless Chromium and
// save the SVG beside it (fixtures/<name>.svg). Mermaid measures text in the
// browser, so the SVGs are the real input toDrawio sees.
//
//   npm run fixtures            all fixtures
//   npm run fixtures -- basic   only fixtures/basic.mmd
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { MERMAID_CONFIG } from "./mermaid-config.mjs";

const require = createRequire(import.meta.url);
const mermaidJs = require.resolve("mermaid/dist/mermaid.min.js");
const dir = new URL("../fixtures/", import.meta.url);
const only = process.argv.slice(2);
const names = (await readdir(dir))
  .filter((f) => f.endsWith(".mmd"))
  .map((f) => f.slice(0, -4))
  .filter((n) => only.length === 0 || only.includes(n));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><html><body></body></html>");
await page.addScriptTag({ path: mermaidJs });
await page.evaluate((config) => window.mermaid.initialize(config), MERMAID_CONFIG);
for (const name of names) {
  const code = await readFile(new URL(`${name}.mmd`, dir), "utf8");
  const svg = await page.evaluate(async ([id, code]) => (await window.mermaid.render(id, code)).svg, [name, code]);
  await writeFile(new URL(`${name}.svg`, dir), svg + "\n");
  console.log(`fixtures/${name}.svg`);
}
await browser.close();
