import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Standalone config so tests don't load the Lovable/TanStack Start build plugins.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
