import { defineConfig } from "vite";

// VITE_BASE is set by the GitHub Pages workflow to "/<repo>/" so asset
// URLs resolve under the project subpath. Fallback "./" keeps preview
// builds and other static hosts working with relative paths.
export default defineConfig({
  base: process.env.VITE_BASE ?? "./",
});
