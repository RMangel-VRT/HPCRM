import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests do not start the preview server or require its injected PORT/BASE_PATH.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
    },
  },
  esbuild: { jsx: "automatic" },
  test: { environment: "node" },
});
