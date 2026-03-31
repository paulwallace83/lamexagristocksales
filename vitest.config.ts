import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        // Prevent Vite from bundling native Node modules
        external: ["better-sqlite3"],
      },
    },
  },
});
