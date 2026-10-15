// Screenshot the dev page (Mermaid beside draw.io's viewer of the conversion)
// for each fixture, into out/<name>.png. For eyeballing changes.
//
//   node scripts/compare.mjs [name…] [--dagre]
import { mkdir, readdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

const args = process.argv.slice(2);
const dagre = args.includes("--dagre");
const only = args.filter((a) => !a.startsWith("--"));
const names = (await readdir(new URL("../fixtures/", import.meta.url)))
  .filter((f) => f.endsWith(".mmd"))
  .map((f) => f.slice(0, -4))
  .filter((n) => only.length === 0 || only.includes(n));

const server = await createServer({ configFile: new URL("../vite.config.ts", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"), server: { port: 5198 } });
await server.listen();
const url = server.resolvedUrls.local[0];
await mkdir(new URL("../out/", import.meta.url), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
for (const name of names) {
  await page.goto(`${url}?fixture=${name}`);
  if (dagre) await page.check("#dagre");
  await page.waitForSelector("body[data-ready]:not([data-ready=error])", { timeout: 30000 });
  await page.waitForTimeout(500);
  const out = `out/${name}${dagre ? "-dagre" : ""}.png`;
  await page.locator("main").screenshot({ path: out });
  console.log(out);
}
await browser.close();
await server.close();
