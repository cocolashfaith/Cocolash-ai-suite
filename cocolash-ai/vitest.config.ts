import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "lib/seedance/ugc-image-prompt.test-examples.ts",
    ],
    environment: "node",
    globals: false,
    reporters: "default",
  },
});
