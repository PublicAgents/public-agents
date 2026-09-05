import { defineConfig } from "astro/config";

// Fully static: every page is a file; the Worker in ../worker rewrites
// /@Handle to the page emitted under /agents/<handle>, and negotiates
// markdown. Nothing here renders at request time.
export default defineConfig({
  site: "https://public-agents.com",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" }
});
