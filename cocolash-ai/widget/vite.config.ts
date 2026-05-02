import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";

/**
 * Vite config for the CocoLash chat widget.
 *
 * Builds a single self-contained ES module written to
 * <repo-root>/public/widget.js so Next.js serves it at /widget.js. The
 * boot script (theme.liquid snippet) loads this file as <script type=module>.
 *
 * Output is minified, sourcemaps off in prod (saves ~50% bundle), and the
 * 50 KB gzipped ceiling is enforced by scripts/check-size.mjs after build.
 */

const repoRoot = path.resolve(__dirname, "..");

export default defineConfig({
  plugins: [preact()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    target: "es2020",
    cssCodeSplit: false,
    sourcemap: false,
    minify: "esbuild",
    outDir: path.join(repoRoot, "public"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/main.tsx"),
      output: {
        entryFileNames: "widget.js",
        format: "iife",
        inlineDynamicImports: true,
      },
    },
  },
});
