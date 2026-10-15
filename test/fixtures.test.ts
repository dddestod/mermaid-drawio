import { describe, expect, it } from "vitest";
import { toDrawio } from "../src/index.ts";

// Each fixtures/<name>.svg is Mermaid 12.2's render of fixtures/<name>.mmd
// (npm run fixtures); fixtures/<name>.drawio is the expected conversion.
// After an intended change, review the diff and update with `npx vitest run -u`.
const svgs = import.meta.glob("../fixtures/*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function mount(markup: string): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.appendChild(host);
  return host.querySelector("svg")!;
}

describe("fixtures", () => {
  for (const [path, markup] of Object.entries(svgs)) {
    const name = path.replace(/^.*\/|\.svg$/g, "");
    it(name, async () => {
      const svg = mount(markup);
      try {
        await expect(toDrawio(svg)).toMatchFileSnapshot(`../fixtures/${name}.drawio`);
      } finally {
        svg.parentElement!.remove();
      }
    });
  }
});
