import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    typecheck: {
      include: ["tests/type-tests/**/*.test-d.ts"],
    },
  },
});
