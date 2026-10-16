import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
import { JSDOM } from "jsdom";
import {
  convertInBrowser,
  resolveRepo,
} from "../skills/mermaid-drawio/scripts/diagram.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const helper = path.join(repo, "skills/mermaid-drawio/scripts/diagram.mjs");
const code = await readFile(
  new URL("../skills/mermaid-drawio/examples/workflow.mmd", import.meta.url),
  "utf8",
);
const colors =
  "flowchart LR\n A[Input] -->|Go| B{Ready?}\n style A fill:#123456,stroke:#654321,color:#ffffff\n linkStyle 0 stroke:#aa3344";
let temp, browser, bundle;

before(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), "mermaid drawio skill "));
  bundle = (
    await build({
      entryPoints: [path.join(repo, "src/index.ts")],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "MermaidDrawio",
      platform: "browser",
    })
  ).outputFiles[0].text;
  browser = await chromium.launch({
    executablePath: process.env.MERMAID_DRAWIO_BROWSER || undefined,
  });
});
after(async () => {
  await browser?.close();
  if (temp) await rm(temp, { recursive: true, force: true });
});

async function pageWithConverter() {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({
    path: path.join(repo, "node_modules/mermaid/dist/mermaid.min.js"),
  });
  await page.addScriptTag({ content: bundle });
  return page;
}

function cells(xml) {
  const doc = new JSDOM(xml, { contentType: "application/xml" }).window
    .document;
  return [...doc.querySelectorAll("mxCell")];
}
function style(cell) {
  return Object.fromEntries(
    (cell.getAttribute("style") || "")
      .split(";")
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf("=");
        return i < 0 ? [part, null] : [part.slice(0, i), part.slice(i + 1)];
      }),
  );
}
function semantics(xml) {
  return cells(xml)
    .filter((c) => !c.id.startsWith("beautify-"))
    .map((c) => ({
      attrs: [
        "id",
        "value",
        "parent",
        "source",
        "target",
        "vertex",
        "edge",
      ].map((a) => c.getAttribute(a)),
      shape: Object.entries(style(c)).filter(
        ([k, v]) =>
          v === null ||
          [
            "shape",
            "container",
            "startArrow",
            "endArrow",
            "dashed",
            "dashPattern",
            "direction",
            "points",
            "polyCoords",
          ].includes(k),
      ),
    }));
}

test("discovers a containing source archive without Git, regardless of cwd", async () => {
  const checkout = path.join(temp, "source archive");
  const skill = path.join(checkout, "skills/mermaid-drawio");
  await mkdir(path.join(checkout, "src"), { recursive: true });
  await mkdir(skill, { recursive: true });
  await writeFile(
    path.join(checkout, "package.json"),
    '{"name":"mermaid-drawio"}',
  );
  await writeFile(
    path.join(checkout, "src/index.ts"),
    "// local development edits\n",
  );
  assert.equal(await resolveRepo({}, {}, skill, {}), checkout);
  assert.equal(await resolveRepo({}, { repo: "../.." }, skill, {}), checkout);
  assert.equal(
    await resolveRepo({ repo }, { repo: "missing" }, skill, {
      MERMAID_DRAWIO_REPO: "missing",
    }),
    path.resolve(repo),
  );
  assert.equal(
    await resolveRepo({}, { repo: "missing" }, skill, {
      MERMAID_DRAWIO_REPO: repo,
    }),
    path.resolve(repo),
  );
  await assert.rejects(
    resolveRepo({ repo: path.join(temp, "missing") }, {}, skill, {}),
    /checkout not found/,
  );
  await assert.rejects(resolveRepo({}, {}, temp, {}), /No containing/);
});

test("CLI rejects accidental styling in faithful mode and protects existing files", async () => {
  const cli = (args) =>
    spawnSync(process.execPath, [helper, ...args], {
      encoding: "utf8",
      cwd: temp,
    });
  for (const args of [
    ["--mode", "unknown"],
    ["--title", "Oops"],
    ["--style-map", "map.json"],
    ["--font-size", "20"],
  ]) {
    assert.equal(cli(args).status, 1);
  }
  assert.match(cli(["--title", "Oops"]).stderr, /require --mode beautify/);
  const stem = path.join(temp, "existing");
  await writeFile(stem + ".png", "keep me");
  const result = cli(["--input", "missing.mmd", "--out", stem]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Output exists/);
  assert.equal(await readFile(stem + ".png", "utf8"), "keep me");
  const same = cli(["--input", stem + ".mmd", "--out", stem, "--overwrite"]);
  assert.equal(same.status, 1);
  assert.match(same.stderr, /Input must differ/);
});

test("faithful output equals direct conversion of Mermaid defaults and supplied config", async () => {
  for (const config of [
    {},
    {
      theme: "dark",
      fontFamily: "Arial",
      flowchart: { htmlLabels: false, nodeSpacing: 31 },
    },
  ]) {
    const page = await pageWithConverter();
    try {
      const result = await page.evaluate(convertInBrowser, {
        code: colors,
        config,
      });
      const direct = await page.evaluate(
        async ({ code, config }) => {
          mermaid.initialize({
            ...config,
            startOnLoad: false,
            securityLevel: "strict",
          });
          const { svg } = await mermaid.render("diagram", code);
          return MermaidDrawio.svgStringToDrawio(svg);
        },
        { code: colors, config },
      );
      assert.equal(result.xml, direct);
      assert.equal(result.xml, result.raw);
      assert.equal(result.counts.nodes, 2);
      assert.match(result.xml, /fillColor=#123456/);
      assert.match(result.xml, /strokeColor=#aa3344/i);
      assert.ok(!result.xml.includes("beautify-title"));
    } finally {
      await page.close();
    }
  }
});

test("beautify preserves semantic shapes, labeled branches, groups, retry dashes and two-way arrows", async () => {
  const page = await pageWithConverter();
  try {
    const result = await page.evaluate(convertInBrowser, {
      code,
      mode: "beautify",
      title: "Assessment workflow",
      roles: { E: "dark", F: "teal" },
    });
    assert.deepEqual(semantics(result.xml), semantics(result.raw));
    assert.deepEqual(result.counts, { nodes: 7, groups: 2, edges: 7 });
    assert.ok(result.semanticsVerified);
    const all = cells(result.xml);
    const retry = all.find((c) =>
      c.getAttribute("value")?.includes("Correct and retry"),
    );
    assert.equal(style(retry).dashed, "1");
    assert.equal(retry.getAttribute("source"), "node-D");
    assert.equal(retry.getAttribute("target"), "node-A");
    const twoWay = all.find(
      (c) =>
        c.getAttribute("source") === "node-E" &&
        c.getAttribute("target") === "node-F",
    );
    assert.notEqual(style(twoWay).startArrow, "none");
    assert.notEqual(style(twoWay).endArrow, "none");
    assert.equal(
      style(all.find((c) => c.id === "node-E")).fillColor,
      "#254B78",
    );
    const processStyle = style(all.find((c) => c.id === "node-E"));
    assert.notEqual(processStyle.fillColor, processStyle.strokeColor);
    assert.ok(all.some((c) => c.id === "beautify-title"));
  } finally {
    await page.close();
  }
});

test("beautify keeps spacing options when --config sets other flowchart keys", async () => {
  const page = await pageWithConverter();
  try {
    // dagre: Mermaid 12's default ELK layout ignores flowchart.nodeSpacing.
    const width = async (nodeSpacing) => {
      const { xml } = await page.evaluate(convertInBrowser, {
        code: "flowchart TB\n A --> B\n A --> C",
        mode: "beautify",
        config: { layout: "dagre", flowchart: { htmlLabels: false } },
        nodeSpacing,
      });
      return Number(xml.match(/pageWidth="(\d+)"/)[1]);
    };
    assert.ok((await width(200)) > (await width(20)));
  } finally {
    await page.close();
  }
});

test("beautify --preserve-colors retains explicit node and edge colors", async () => {
  const page = await pageWithConverter();
  try {
    const result = await page.evaluate(convertInBrowser, {
      code: colors,
      mode: "beautify",
      preserve: true,
    });
    const raw = cells(result.raw),
      styled = cells(result.xml);
    for (const cell of raw) {
      const other = styled.find((c) => c.id === cell.id);
      for (const key of ["fillColor", "strokeColor", "fontColor"]) {
        assert.equal(style(other)[key], style(cell)[key]);
      }
    }
  } finally {
    await page.close();
  }
});

test("faithful converts state, ER and class diagrams; beautify refuses them", async () => {
  const page = await pageWithConverter();
  try {
    for (const source of [
      "stateDiagram-v2\n [*] --> Idle\n Idle --> [*]",
      "erDiagram\n A ||--o{ B : has\n A {\n string id PK\n }",
      "classDiagram\n Animal <|-- Dog\n class Animal {\n +name\n }",
    ]) {
      const result = await page.evaluate(convertInBrowser, { code: source, mode: "faithful" });
      assert.match(result.raw, /<mxGraphModel/);
      await assert.rejects(
        page.evaluate(convertInBrowser, { code: source, mode: "beautify" }),
        /faithful mode/,
      );
    }
  } finally {
    await page.close();
  }
});

test("both modes reject unsupported diagram types, and beautify rejects unknown palette IDs", async () => {
  const page = await pageWithConverter();
  try {
    for (const mode of ["faithful", "beautify"]) {
      await assert.rejects(
        page.evaluate(convertInBrowser, {
          code: "sequenceDiagram\n A->>B: hi",
          mode,
        }),
        /flowchart/i,
      );
    }
    await assert.rejects(
      page.evaluate(convertInBrowser, {
        code,
        mode: "beautify",
        roles: { missing: "blue" },
      }),
      /IDs not found/,
    );
  } finally {
    await page.close();
  }
});
