import { describe, expect, it } from "vitest";
import mermaid from "mermaid";
import { svgStringToDrawio, toDrawio, UnsupportedDiagramError } from "../src/index.ts";
import { MERMAID_CONFIG } from "../scripts/mermaid-config.mjs";

mermaid.initialize(MERMAID_CONFIG);

describe("api", () => {
  it("converts markup that isn't in the document, and leaves the document as it was", async () => {
    const { svg } = await mermaid.render("api1", "flowchart LR\n  A[One] --> B[Two]");
    const before = document.body.innerHTML;
    const xml = svgStringToDrawio(svg);
    expect(document.body.innerHTML).toBe(before);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const cells = Array.from(doc.querySelectorAll("mxCell"));
    expect(cells.filter((c) => c.getAttribute("vertex")).map((c) => c.getAttribute("value"))).toEqual(["One", "Two"]);
    const edge = cells.find((c) => c.getAttribute("edge"))!;
    expect([edge.getAttribute("source"), edge.getAttribute("target")]).toEqual(["node-A", "node-B"]);
  });

  it("converts an SVG element in place, keeping it where it was", async () => {
    const { svg } = await mermaid.render("api2", "flowchart TD\n  A --> B");
    const host = document.createElement("div");
    host.innerHTML = svg;
    document.body.appendChild(host);
    const el = host.querySelector("svg")!;
    expect(toDrawio(el, { pageName: "My <diagram>" })).toContain('name="My &lt;diagram&gt;"');
    expect(el.parentElement).toBe(host);
    host.remove();
  });

  it("refuses other diagram types", async () => {
    const { svg } = await mermaid.render("api3", "sequenceDiagram\n  A->>B: hi");
    expect(() => svgStringToDrawio(svg)).toThrow(UnsupportedDiagramError);
  });
});
