import { defineConfig } from "vite";

// The dev page (dev/): a Mermaid diagram beside its draw.io conversion.
export default defineConfig({
  root: "dev",
  server: { port: 5199, fs: { allow: [".."] } },
});
