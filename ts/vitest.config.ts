import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@nvoke/core": fileURLToPath(new URL("packages/core/src/index.ts", import.meta.url)),
      "@nvoke/registry-local": fileURLToPath(
        new URL("packages/registry-local/src/index.ts", import.meta.url),
      ),
    },
  },
});
