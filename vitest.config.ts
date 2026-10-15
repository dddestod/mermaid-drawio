import { defineConfig } from "vitest/config";

// Tests run in real Chromium: the converter measures the SVG (getBBox,
// computed styles), which jsdom can't do.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
